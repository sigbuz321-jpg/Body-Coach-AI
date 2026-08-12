import {
  AiProviderError,
  type AiProvider,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ContentPart,
  type EmbedResponse,
  type ToolCall,
} from './types';

/**
 * Provider MiniMax (https://api.minimax.io).
 *
 * MiniMax menyediakan antarmuka yang kompatibel dengan OpenAI Chat
 * Completions, jadi di sini tidak ada SDK vendor sama sekali — hanya `fetch`.
 * Itu disengaja: SDK menambah ratusan kilobyte dependensi untuk empat request
 * yang bentuknya sudah stabil, dan satu-satunya bagian yang benar-benar khas
 * vendor adalah nama model serta bentuk error-nya.
 *
 * Model:
 * - `MiniMax-M3` — teks + gambar dalam satu model, konteks 1 juta token.
 *   Dipakai untuk coach (M5) dan analisis foto makanan (M6).
 * - `embo-01` — embedding, dipakai tahap 3 food resolver (M6).
 *
 * AD-1 tetap berlaku: model ini tidak pernah menjadi sumber angka gizi.
 * Ia mengenali makanan dan menyusun kalimat; kalori dan makro datang dari
 * food database serta nutrition engine.
 */

const DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_CHAT_MODEL = 'MiniMax-M3';
const DEFAULT_EMBED_MODEL = 'embo-01';

/**
 * Dimensi embedding yang diasumsikan skema (`vector(1536)` di 0001_init.sql).
 * Diperiksa saat runtime: vektor dengan panjang lain akan ditolak Postgres
 * dengan error yang jauh lebih sulit dibaca daripada pesan di bawah.
 */
export const EXPECTED_EMBEDDING_DIMENSIONS = 1536;

export interface MiniMaxOptions {
  readonly apiKey: string;
  readonly chatModel?: string;
  readonly embedModel?: string;
  readonly baseUrl?: string;
  /** Batas waktu satu request. Worker punya batas sendiri di atas ini. */
  readonly timeoutMs?: number;
  /** Disuntik di test. Default: `globalThis.fetch`. */
  readonly fetchImpl?: typeof fetch;
}

interface OpenAiToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChoice {
  message?: {
    content?: string | null;
    tool_calls?: OpenAiToolCall[];
  };
  finish_reason?: string;
}

interface OpenAiChatBody {
  choices?: OpenAiChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
  /** MiniMax menyertakan status di luar HTTP status pada sebagian error. */
  base_resp?: { status_code?: number; status_msg?: string };
}

interface OpenAiEmbedBody {
  data?: { embedding?: number[] }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
  model?: string;
  base_resp?: { status_code?: number; status_msg?: string };
}

/** Status HTTP yang layak dicoba ulang: throttle dan gangguan sisi server. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Pesan error yang bisa langsung ditindaklanjuti.
 *
 * Tanpa ini, kegagalan paling umum saat integrasi baru — saldo akun habis —
 * muncul sebagai gumpalan JSON yang harus dibaca manual. Dua kondisi di bawah
 * punya jalan keluar yang berbeda dan tidak boleh tertukar: saldo habis butuh
 * top-up, kunci salah butuh kunci baru.
 */
function explainHttpError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 402 || lower.includes('insufficient_balance') || lower.includes('1008')) {
    return (
      'MiniMax menolak: saldo akun habis (402/1008). Isi ulang kredit di ' +
      'platform.minimax.io sebelum coach atau analisis foto bisa dipakai.'
    );
  }
  if (status === 401 || status === 403) {
    return `MiniMax menolak kunci API (${status}). Periksa AI_PROVIDER_KEY di .env.local.`;
  }
  if (status === 429) {
    return 'MiniMax membatasi laju permintaan (429). Worker akan mencoba lagi.';
  }
  return `MiniMax ${status}: ${body.slice(0, 300)}`;
}

function toOpenAiContent(content: string | readonly ContentPart[]): unknown {
  if (typeof content === 'string') return content;
  return content.map((part) =>
    part.kind === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'image_url',
          image_url: { url: part.url, ...(part.detail ? { detail: part.detail } : {}) },
        },
  );
}

function toOpenAiMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: m.toolCallId,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    };
  }
  const base: Record<string, unknown> = { role: m.role, content: toOpenAiContent(m.content) };
  if (m.toolCalls && m.toolCalls.length > 0) {
    base['tool_calls'] = m.toolCalls.map((t) => ({
      id: t.id,
      type: 'function',
      function: { name: t.name, arguments: JSON.stringify(t.arguments) },
    }));
  }
  return base;
}

/**
 * Argumen tool datang sebagai string JSON. Model bisa mengirim JSON cacat;
 * itu bukan alasan untuk menjatuhkan seluruh pesan pengguna, jadi tool call
 * yang tidak bisa di-parse dibuang dan sisanya tetap dipakai.
 */
function parseToolCalls(raw: OpenAiToolCall[] | undefined): ToolCall[] {
  if (!raw) return [];
  const out: ToolCall[] = [];
  for (const call of raw) {
    const name = call.function?.name;
    if (!name) continue;
    let args: Record<string, unknown> = {};
    const text = call.function?.arguments;
    if (text && text.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        } else {
          continue;
        }
      } catch {
        continue;
      }
    }
    out.push({ id: call.id ?? `${name}-${out.length}`, name, arguments: args });
  }
  return out;
}

export function createMiniMaxProvider(opts: MiniMaxOptions): AiProvider {
  const {
    apiKey,
    chatModel = DEFAULT_CHAT_MODEL,
    embedModel = DEFAULT_EMBED_MODEL,
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = 30_000,
    fetchImpl = globalThis.fetch,
  } = opts;

  if (!apiKey) {
    throw new AiProviderError('AI_PROVIDER_KEY kosong', 0, false, 'minimax');
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // Abort dan kegagalan jaringan sama-sama layak dicoba ulang.
      const msg = err instanceof Error ? err.message : 'gagal menghubungi MiniMax';
      throw new AiProviderError(msg, 0, true, 'minimax');
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new AiProviderError(
        explainHttpError(res.status, text),
        res.status,
        isRetryableStatus(res.status),
        'minimax',
      );
    }

    let parsed: T & { base_resp?: { status_code?: number; status_msg?: string } };
    try {
      parsed = JSON.parse(text) as T & { base_resp?: { status_code?: number } };
    } catch {
      throw new AiProviderError('MiniMax mengembalikan JSON tidak valid', 502, true, 'minimax');
    }

    // MiniMax bisa membalas HTTP 200 dengan kegagalan di `base_resp`.
    // Tanpa pemeriksaan ini, error kuota terbaca sebagai balasan kosong.
    const code = parsed.base_resp?.status_code;
    if (typeof code === 'number' && code !== 0) {
      const msg = parsed.base_resp?.status_msg ?? 'tidak diketahui';
      // 1002 rate limit, 1039 token limit -> boleh diulang.
      throw new AiProviderError(
        `MiniMax base_resp ${code}: ${msg}`,
        200,
        code === 1002 || code === 1039,
        'minimax',
      );
    }
    return parsed;
  }

  return {
    name: 'minimax',

    async chat(req: ChatRequest): Promise<ChatResponse> {
      const body: Record<string, unknown> = {
        model: chatModel,
        messages: req.messages.map(toOpenAiMessage),
      };
      if (req.tools && req.tools.length > 0) {
        body['tools'] = req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }
      if (req.maxTokens !== undefined) body['max_tokens'] = req.maxTokens;
      if (req.temperature !== undefined) body['temperature'] = req.temperature;
      if (req.jsonMode) body['response_format'] = { type: 'json_object' };

      const data = await post<OpenAiChatBody>('/chat/completions', body);
      const choice = data.choices?.[0];

      return {
        text: choice?.message?.content ?? '',
        toolCalls: parseToolCalls(choice?.message?.tool_calls),
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
        model: data.model ?? chatModel,
        finishReason: choice?.finish_reason ?? 'stop',
      };
    },

    async embed(texts: readonly string[]): Promise<EmbedResponse> {
      if (texts.length === 0) {
        return { vectors: [], usage: { promptTokens: 0, completionTokens: 0 }, model: embedModel };
      }
      const data = await post<OpenAiEmbedBody>('/embeddings', {
        model: embedModel,
        input: [...texts],
        // MiniMax memisahkan embedding untuk dokumen dan untuk kueri.
        // Keduanya harus konsisten; di sini semua diperlakukan sebagai dokumen
        // supaya vektor yang tersimpan dan vektor pencarian hidup di ruang
        // yang sama (lihat catatan M6 soal ivfflat).
        type: 'db',
      });

      const vectors = (data.data ?? []).map((d) => d.embedding ?? []);
      for (const v of vectors) {
        if (v.length !== EXPECTED_EMBEDDING_DIMENSIONS) {
          throw new AiProviderError(
            `dimensi embedding ${v.length}, skema mengharapkan ${EXPECTED_EMBEDDING_DIMENSIONS} ` +
              `(kolom food_items.embedding). Sesuaikan migration atau model embedding.`,
            200,
            false,
            'minimax',
          );
        }
      }

      return {
        vectors,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: 0,
        },
        model: data.model ?? embedModel,
      };
    },
  };
}
