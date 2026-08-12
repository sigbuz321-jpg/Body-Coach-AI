import { describe, expect, it } from 'vitest';

import { createMiniMaxProvider, EXPECTED_EMBEDDING_DIMENSIONS } from './minimax';
import { AiProviderError } from './types';

/**
 * Tes batas vendor. `fetch` disuntik, jadi tidak ada request nyata ke MiniMax
 * dan tidak ada kunci API yang dibutuhkan untuk menjalankan test ini.
 *
 * Yang dijaga di sini adalah hal-hal yang bikin bug diam: MiniMax bisa
 * membalas HTTP 200 dengan kegagalan di `base_resp`, dan tool call bisa datang
 * dengan JSON cacat.
 */

interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

function stubFetch(response: unknown, status = 200, captured?: Captured[]) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured?.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function provider(fetchImpl: typeof fetch) {
  return createMiniMaxProvider({ apiKey: 'kunci-uji', fetchImpl });
}

describe('konstruksi', () => {
  it('menolak kunci kosong dengan error yang tidak layak diulang', () => {
    try {
      createMiniMaxProvider({ apiKey: '' });
      expect.unreachable('seharusnya melempar');
    } catch (err) {
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).retryable).toBe(false);
    }
  });
});

describe('chat', () => {
  it('mengirim ke endpoint OpenAI-compatible dengan bearer token', async () => {
    const captured: Captured[] = [];
    const p = provider(
      stubFetch(
        { choices: [{ message: { content: 'halo' }, finish_reason: 'stop' }] },
        200,
        captured,
      ),
    );
    await p.chat({ messages: [{ role: 'user', content: 'hai' }] });

    expect(captured[0]?.url).toBe('https://api.minimax.io/v1/chat/completions');
    expect(captured[0]?.headers['Authorization']).toBe('Bearer kunci-uji');
    expect(captured[0]?.body['model']).toBe('MiniMax-M3');
  });

  it('mengembalikan teks dan penggunaan token', async () => {
    const p = provider(
      stubFetch({
        choices: [{ message: { content: 'sip' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
        model: 'MiniMax-M3',
      }),
    );
    const res = await p.chat({ messages: [{ role: 'user', content: 'hai' }] });

    expect(res.text).toBe('sip');
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 3 });
    expect(res.finishReason).toBe('stop');
  });

  it('mem-parse tool call menjadi argumen objek', async () => {
    const p = provider(
      stubFetch({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  function: { name: 'log_food', arguments: '{"items":[{"raw_label":"nasi"}]}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    const res = await p.chat({ messages: [{ role: 'user', content: 'gue makan nasi' }] });

    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0]?.name).toBe('log_food');
    expect(res.toolCalls[0]?.arguments).toEqual({ items: [{ raw_label: 'nasi' }] });
    expect(res.text).toBe('');
  });

  it('membuang tool call dengan JSON cacat, bukan menjatuhkan seluruh balasan', async () => {
    const p = provider(
      stubFetch({
        choices: [
          {
            message: {
              content: 'oke',
              tool_calls: [
                { id: 'a', function: { name: 'log_food', arguments: '{rusak' } },
                { id: 'b', function: { name: 'get_daily_status', arguments: '{}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    const res = await p.chat({ messages: [{ role: 'user', content: 'x' }] });

    expect(res.toolCalls.map((t) => t.name)).toEqual(['get_daily_status']);
    expect(res.text).toBe('oke');
  });

  it('mengubah bagian gambar menjadi image_url', async () => {
    const captured: Captured[] = [];
    const p = provider(stubFetch({ choices: [{ message: { content: '{}' } }] }, 200, captured));
    await p.chat({
      messages: [
        {
          role: 'user',
          content: [
            { kind: 'text', text: 'makanan apa ini?' },
            { kind: 'image', url: 'https://contoh/a.jpg', detail: 'high' },
          ],
        },
      ],
      jsonMode: true,
    });

    const msgs = captured[0]?.body['messages'] as { content: unknown[] }[];
    expect(msgs[0]?.content).toEqual([
      { type: 'text', text: 'makanan apa ini?' },
      { type: 'image_url', image_url: { url: 'https://contoh/a.jpg', detail: 'high' } },
    ]);
    expect(captured[0]?.body['response_format']).toEqual({ type: 'json_object' });
  });
});

describe('penanganan error', () => {
  it('429 layak dicoba ulang', async () => {
    const p = provider(stubFetch({ error: 'slow down' }, 429));
    await expect(p.chat({ messages: [] })).rejects.toMatchObject({
      retryable: true,
      status: 429,
    });
  });

  it('402 saldo habis: pesan yang bisa ditindaklanjuti, tidak diulang', async () => {
    // Persis yang terjadi saat integrasi pertama 12 Agustus 2026: kunci valid,
    // saldo nol. Tanpa penjelasan ini, yang terlihat cuma gumpalan JSON.
    const p = provider(
      stubFetch(
        {
          type: 'error',
          error: { type: 'insufficient_balance_error', message: 'insufficient balance (1008)' },
        },
        402,
      ),
    );
    await expect(p.chat({ messages: [] })).rejects.toMatchObject({
      retryable: false,
      status: 402,
    });
    await expect(p.chat({ messages: [] })).rejects.toThrow(/saldo akun habis/);
  });

  it('401 menyebut AI_PROVIDER_KEY, bukan JSON mentah', async () => {
    const p = provider(stubFetch({ error: 'bad key' }, 401));
    await expect(p.chat({ messages: [] })).rejects.toThrow(/AI_PROVIDER_KEY/);
  });

  it('401 tidak layak dicoba ulang', async () => {
    const p = provider(stubFetch({ error: 'bad key' }, 401));
    await expect(p.chat({ messages: [] })).rejects.toMatchObject({
      retryable: false,
      status: 401,
    });
  });

  it('HTTP 200 dengan base_resp gagal tetap dianggap error', async () => {
    // Ini yang membuat kegagalan kuota terbaca sebagai "balasan kosong"
    // kalau tidak diperiksa.
    const p = provider(
      stubFetch({ base_resp: { status_code: 1008, status_msg: 'insufficient balance' } }),
    );
    await expect(p.chat({ messages: [] })).rejects.toThrow(/1008/);
  });

  it('rate limit di base_resp (1002) layak dicoba ulang', async () => {
    const p = provider(stubFetch({ base_resp: { status_code: 1002, status_msg: 'rate limit' } }));
    await expect(p.chat({ messages: [] })).rejects.toMatchObject({ retryable: true });
  });

  it('kegagalan jaringan layak dicoba ulang', async () => {
    const failing = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const p = provider(failing);
    await expect(p.chat({ messages: [] })).rejects.toMatchObject({ retryable: true });
  });
});

describe('embed', () => {
  it('tidak memanggil jaringan untuk input kosong', async () => {
    const captured: Captured[] = [];
    const p = provider(stubFetch({}, 200, captured));
    const res = await p.embed([]);

    expect(res.vectors).toEqual([]);
    expect(captured).toHaveLength(0);
  });

  it('mengembalikan vektor dengan dimensi yang diharapkan skema', async () => {
    const vec = Array.from({ length: EXPECTED_EMBEDDING_DIMENSIONS }, () => 0.01);
    const p = provider(stubFetch({ data: [{ embedding: vec }], model: 'embo-01' }));
    const res = await p.embed(['nasi padang']);

    expect(res.vectors[0]).toHaveLength(EXPECTED_EMBEDDING_DIMENSIONS);
    expect(res.model).toBe('embo-01');
  });

  it('menolak dimensi yang tidak cocok dengan kolom vector(1536)', async () => {
    const p = provider(stubFetch({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
    await expect(p.embed(['nasi'])).rejects.toThrow(/dimensi embedding 3/);
  });
});
