import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifikasi `X-Hub-Signature-256` dari Meta.
 *
 * Meta menandatangani **byte mentah** body dengan HMAC-SHA256 memakai App
 * Secret. Karena itu handler wajib membaca `req.text()` dan memverifikasi
 * string itu sebelum `JSON.parse` — mem-parse lalu men-stringify ulang
 * menghasilkan byte berbeda (urutan kunci, spasi) dan tanda tangannya tidak
 * akan pernah cocok.
 *
 * Perbandingan memakai `timingSafeEqual`: `===` pada string membocorkan
 * berapa banyak karakter awal yang benar lewat waktu eksekusi, yang cukup
 * untuk menebak tanda tangan byte demi byte.
 */

const PREFIX = 'sha256=';

export function computeSignature(rawBody: string, appSecret: string): string {
  return PREFIX + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
}

export function verifySignature(
  rawBody: string,
  headerValue: string | null | undefined,
  appSecret: string,
): boolean {
  // App secret kosong berarti belum dikonfigurasi. Menerima semua request
  // dalam kondisi itu jauh lebih berbahaya daripada menolak semuanya:
  // endpoint webhook bersifat publik.
  if (!appSecret) return false;
  if (!headerValue || !headerValue.startsWith(PREFIX)) return false;

  const expected = Buffer.from(computeSignature(rawBody, appSecret), 'utf8');
  const actual = Buffer.from(headerValue, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Handshake verifikasi webhook (GET). Meta memanggil endpoint dengan
 * `hub.mode=subscribe` dan token yang kita tentukan sendiri; jawabannya harus
 * memantulkan `hub.challenge` apa adanya.
 */
export function verifyWebhookChallenge(
  params: URLSearchParams,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false; reason: string } {
  if (!verifyToken) return { ok: false, reason: 'WA_WEBHOOK_VERIFY_TOKEN belum diisi' };
  if (params.get('hub.mode') !== 'subscribe')
    return { ok: false, reason: 'hub.mode bukan subscribe' };
  if (params.get('hub.verify_token') !== verifyToken)
    return { ok: false, reason: 'token tidak cocok' };
  const challenge = params.get('hub.challenge');
  if (!challenge) return { ok: false, reason: 'hub.challenge kosong' };
  return { ok: true, challenge };
}
