import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tes kontrak webhook. Redis di-mock; `@bodycoach/whatsapp` tidak — signature
 * yang diverifikasi di sini adalah HMAC sungguhan.
 *
 * Tiga item DoD M5 dijaga di sini:
 * - request tanpa signature valid ditolak 401
 * - replay payload identik 3x hanya masuk antrean sekali
 * - handler tidak pernah memanggil AI (dijaga lewat: modul AI tidak diimpor)
 */

const state = vi.hoisted(() => ({
  seen: new Set<string>(),
  queue: [] as Record<string, unknown>[],
  enqueueError: false,
  reset() {
    this.seen = new Set();
    this.queue = [];
    this.enqueueError = false;
  },
}));

vi.mock('@bodycoach/db', () => ({
  markMessageSeen: async (id: string) => {
    if (state.seen.has(id)) return false;
    state.seen.add(id);
    return true;
  },
  enqueueMessage: async (job: Record<string, unknown>) => {
    if (state.enqueueError) throw new Error('Redis mati');
    state.queue.push(job);
  },
}));

const { GET, POST } = await import('./route');
const { computeSignature } = await import('@bodycoach/whatsapp');

const SECRET = 'app-secret-uji';
const VERIFY_TOKEN = 'token-verifikasi-uji';

function payload(id = 'wamid.1', text = 'halo') {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                {
                  id,
                  from: '628123456789',
                  type: 'text',
                  timestamp: '1754900000',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

function post(body: string, signature?: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const sig = signature === undefined ? computeSignature(body, SECRET) : signature;
  if (sig !== null) headers['x-hub-signature-256'] = sig;
  return POST(
    new Request('https://contoh.test/api/webhooks/whatsapp', { method: 'POST', headers, body }),
  );
}

beforeEach(() => {
  state.reset();
  process.env['WA_APP_SECRET'] = SECRET;
  process.env['WA_WEBHOOK_VERIFY_TOKEN'] = VERIFY_TOKEN;
});

describe('GET — handshake verifikasi', () => {
  function get(params: Record<string, string>): Response {
    const url = new URL('https://contoh.test/api/webhooks/whatsapp');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return GET(new Request(url));
  }

  it('memantulkan hub.challenge apa adanya', async () => {
    const res = get({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '1158201444',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('1158201444');
  });

  it('menolak token yang salah dengan 403', () => {
    const res = get({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'salah',
      'hub.challenge': '1',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST — verifikasi signature', () => {
  it('menolak request tanpa header signature', async () => {
    const res = await post(payload(), null);
    expect(res.status).toBe(401);
    expect(state.queue).toHaveLength(0);
  });

  it('menolak signature yang salah', async () => {
    const res = await post(payload(), 'sha256=' + 'a'.repeat(64));
    expect(res.status).toBe(401);
    expect(state.queue).toHaveLength(0);
  });

  it('menolak signature yang dibuat dengan secret lain', async () => {
    const body = payload();
    const res = await post(body, computeSignature(body, 'secret-lain'));
    expect(res.status).toBe(401);
  });

  it('menolak semuanya saat WA_APP_SECRET belum diisi', async () => {
    process.env['WA_APP_SECRET'] = '';
    const res = await post(payload(), 'sha256=' + 'a'.repeat(64));
    expect(res.status).toBe(401);
  });

  it('menerima signature yang benar', async () => {
    const res = await post(payload());
    expect(res.status).toBe(200);
    expect(state.queue).toHaveLength(1);
  });
});

describe('POST — dedup dan antrean', () => {
  it('replay payload identik 3x hanya masuk antrean sekali', async () => {
    const body = payload('wamid.dedup');
    for (let i = 0; i < 3; i++) {
      expect((await post(body)).status).toBe(200);
    }
    expect(state.queue).toHaveLength(1);
  });

  it('pesan dengan id berbeda tetap masuk semuanya', async () => {
    await post(payload('wamid.a'));
    await post(payload('wamid.b'));
    expect(state.queue).toHaveLength(2);
  });

  it('meneruskan field yang dibutuhkan worker', async () => {
    await post(payload('wamid.x', 'nasi padang'));
    expect(state.queue[0]).toMatchObject({
      waId: '628123456789',
      messageId: 'wamid.x',
      type: 'text',
      body: 'nasi padang',
      ts: 1754900000,
    });
  });
});

describe('POST — ketahanan', () => {
  it('body cacat tetap dibalas 200, bukan memancing retry Meta', async () => {
    const res = await post('{bukan json');
    expect(res.status).toBe(200);
  });

  it('Redis mati tidak membuat handler membalas non-200', async () => {
    // Non-200 membuat Meta me-retry SELURUH batch, termasuk pesan yang sudah
    // berhasil diantrekan.
    state.enqueueError = true;
    const res = await post(payload());
    expect(res.status).toBe(200);
  });

  it('payload tanpa pesan (notifikasi status) dibalas 200 tanpa antrean', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ status: 'delivered' }] } }] }],
    });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(state.queue).toHaveLength(0);
  });

  it('membalas jauh di bawah 300 ms — batas DoD M5', async () => {
    const res = await post(payload('wamid.cepat'));
    expect(Number(res.headers.get('X-Handler-Ms'))).toBeLessThan(300);
  });
});
