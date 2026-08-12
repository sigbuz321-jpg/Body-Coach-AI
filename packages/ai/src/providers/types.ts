/**
 * Kontrak provider AI yang netral vendor.
 *
 * Lapisan di atas ini (coach, vision, resolver) hanya boleh melihat tipe di
 * file ini. Mengganti MiniMax dengan vendor lain berarti menulis satu file
 * baru di `providers/`, bukan menyentuh domain.
 *
 * Catatan AD-1: tipe di sini sengaja tidak punya tempat untuk "angka gizi".
 * Provider mengembalikan teks dan permintaan tool; angka selalu datang dari
 * nutrition engine dan food database.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** Bagian isi pesan. Gambar dipakai untuk analisis foto makanan (M6). */
export type ContentPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly url: string; readonly detail?: 'low' | 'high' };

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string | readonly ContentPart[];
  /** Diisi saat `role: 'tool'` — menautkan hasil ke permintaan tool. */
  readonly toolCallId?: string;
  /** Diisi saat `role: 'assistant'` dan model meminta tool. */
  readonly toolCalls?: readonly ToolCall[];
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  /** Argumen yang sudah di-parse. Provider bertanggung jawab mem-parse JSON-nya. */
  readonly arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema. Sengaja `unknown` — bentuknya milik prompt, bukan provider. */
  readonly parameters: Record<string, unknown>;
}

export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolDefinition[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Memaksa balasan berupa objek JSON. Dipakai vision. */
  readonly jsonMode?: boolean;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface ChatResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: TokenUsage;
  readonly model: string;
  /** `stop`, `tool_calls`, `length`, atau nilai lain dari vendor. */
  readonly finishReason: string;
}

export interface EmbedResponse {
  readonly vectors: readonly (readonly number[])[];
  readonly usage: TokenUsage;
  readonly model: string;
}

export interface AiProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  embed(texts: readonly string[]): Promise<EmbedResponse>;
}

/**
 * Kegagalan provider yang bisa dibedakan pemanggil.
 *
 * `retryable` menentukan apakah worker boleh mencoba lagi. Rate limit dan
 * error 5xx boleh; kunci API salah dan permintaan cacat tidak — mengulangnya
 * hanya membakar kuota untuk hasil yang sama.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly provider: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
