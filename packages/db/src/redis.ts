import { redisEnv } from './env';

/**
 * Klien Redis (Upstash) lewat REST.
 *
 * [DEVIASI] `packages/db` di docs §1 disebut "schema, migration, repository
 * (Postgres)". Redis ditaruh di sini karena keduanya adalah infrastruktur data
 * yang dipakai bersama `apps/web` dan `apps/worker`; menaruhnya di salah satu
 * app berarti app yang lain mengimpor dari app, dan itu batas yang lebih buruk
 * untuk dilanggar. Alternatifnya membuat `packages/queue` baru — belum sepadan
 * untuk tiga perintah.
 *
 * REST, bukan protokol Redis: fungsi serverless tidak bisa memelihara koneksi
 * TCP antar invokasi, dan Upstash REST memang dirancang untuk itu.
 *
 * Tanpa SDK. Bentuk requestnya satu baris JSON array; menambah dependensi
 * untuk itu tidak sepadan.
 */

export interface RedisResult<T> {
  readonly result: T;
}

async function command<T>(args: readonly (string | number)[]): Promise<T> {
  const { url, token } = redisEnv();
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
  });
  if (!res.ok) {
    throw new Error(`Redis ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = (await res.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(`Redis: ${body.error}`);
  return body.result as T;
}

/** Dua hari. Meta me-retry jauh lebih pendek dari itu; ini margin aman. */
const DEDUP_TTL_SECONDS = 172_800;

/**
 * Lapis pertama idempotency (AD-2): `SET key value NX EX`.
 *
 * `true` berarti pesan ini baru dan boleh diproses. `false` berarti sudah
 * pernah dilihat — Meta me-retry webhook dan kadang mengirim duplikat, dan
 * tanpa ini satu foto makanan bisa tercatat tiga kali.
 *
 * Lapis kedua adalah unique constraint `food_logs.source_message_id` di
 * database. Redis bisa kehilangan kunci; constraint tidak.
 */
export async function markMessageSeen(messageId: string): Promise<boolean> {
  const result = await command<string | null>([
    'SET',
    `msg:${messageId}`,
    '1',
    'NX',
    'EX',
    DEDUP_TTL_SECONDS,
  ]);
  return result === 'OK';
}

/** Nama antrean pesan masuk. */
export const QUEUE_MESSAGE_RECEIVED = 'q:message.received';

export interface MessageJob {
  readonly waId: string;
  readonly messageId: string;
  readonly type: string;
  readonly body?: string;
  readonly mediaId?: string;
  readonly buttonId?: string;
  readonly ts: number;
}

/**
 * Menaruh job ke antrean. Handler webhook hanya melakukan ini lalu balas 200
 * (AD-2) — tidak ada pemanggilan AI di dalam handler.
 */
export async function enqueueMessage(job: MessageJob): Promise<void> {
  await command(['LPUSH', QUEUE_MESSAGE_RECEIVED, JSON.stringify(job)]);
}

/** Mengambil satu job. Dipakai worker; `null` bila antrean kosong. */
export async function dequeueMessage(): Promise<MessageJob | null> {
  const raw = await command<string | null>(['RPOP', QUEUE_MESSAGE_RECEIVED]);
  if (!raw) return null;
  return JSON.parse(raw) as MessageJob;
}

/** Panjang antrean. Dipakai simulator dan pemantauan. */
export async function queueLength(): Promise<number> {
  return command<number>(['LLEN', QUEUE_MESSAGE_RECEIVED]);
}
