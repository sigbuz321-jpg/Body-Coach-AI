import { enqueueMessage, markMessageSeen } from '@bodycoach/db';
import {
  extractMessages,
  hashWaId,
  verifySignature,
  verifyWebhookChallenge,
} from '@bodycoach/whatsapp';

/**
 * Webhook Meta WhatsApp Cloud API.
 *
 * AD-2 — WhatsApp adalah transport asinkron. Handler ini **hanya**:
 * verifikasi signature → dedup → enqueue → balas 200.
 *
 * Tidak ada pemanggilan AI, tidak ada query makanan, tidak ada pengiriman
 * balasan. Meta menunggu 200 dalam hitungan detik; kalau tidak dapat, ia
 * me-retry, dan retry atas pekerjaan yang sudah setengah jalan adalah cara
 * paling cepat menghasilkan log makanan ganda.
 *
 * Segala yang lambat dikerjakan `apps/worker` dari antrean.
 */

// Node runtime, bukan edge: verifikasi signature memakai `node:crypto`.
export const runtime = 'nodejs';
// Webhook tidak boleh di-cache maupun di-prerender.
export const dynamic = 'force-dynamic';

/**
 * Handshake verifikasi (GET). Meta memanggil ini sekali saat URL webhook
 * didaftarkan, dan menolak URL yang tidak memantulkan `hub.challenge`.
 */
export function GET(req: Request): Response {
  const url = new URL(req.url);
  const hasil = verifyWebhookChallenge(
    url.searchParams,
    process.env['WA_WEBHOOK_VERIFY_TOKEN'] ?? '',
  );

  if (!hasil.ok) {
    console.warn('[wa-webhook] handshake ditolak:', hasil.reason);
    return new Response('forbidden', { status: 403 });
  }
  // Meta mengharapkan challenge apa adanya sebagai teks biasa.
  return new Response(hasil.challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(req: Request): Promise<Response> {
  const mulai = Date.now();

  // Body MENTAH. Mem-parse lalu men-stringify ulang mengubah byte-nya, dan
  // tanda tangan Meta tidak akan pernah cocok lagi.
  const raw = await req.text();

  if (
    !verifySignature(
      raw,
      req.headers.get('x-hub-signature-256'),
      process.env['WA_APP_SECRET'] ?? '',
    )
  ) {
    // Tidak menyebut alasan: endpoint ini publik, dan membedakan "secret belum
    // diisi" dari "tanda tangan salah" hanya berguna bagi penyerang.
    return new Response('invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Tetap 200: body cacat tidak akan membaik kalau Meta mengirim ulang.
    console.warn('[wa-webhook] body bukan JSON valid');
    return new Response('ok', { status: 200 });
  }

  const messages = extractMessages(payload);

  for (const msg of messages) {
    try {
      const baru = await markMessageSeen(msg.id);
      if (!baru) continue;

      await enqueueMessage({
        waId: msg.from,
        messageId: msg.id,
        type: msg.type,
        ...(msg.text ? { body: msg.text } : {}),
        ...(msg.mediaId ? { mediaId: msg.mediaId } : {}),
        ...(msg.buttonId ? { buttonId: msg.buttonId } : {}),
        ts: msg.timestamp,
      });
    } catch (err) {
      // Satu pesan gagal masuk antrean tidak boleh menjatuhkan seluruh batch,
      // dan tidak boleh membuat handler membalas non-200 — Meta akan me-retry
      // seluruh batch, termasuk pesan yang sudah berhasil diantrekan.
      console.error('[wa-webhook] gagal enqueue', hashWaId(msg.from), err);
    }
  }

  const durasi = Date.now() - mulai;
  if (durasi > 300) {
    // DoD M5: handler harus membalas 200 dalam < 300 ms.
    console.warn(`[wa-webhook] lambat: ${durasi}ms untuk ${messages.length} pesan`);
  }

  return new Response('ok', {
    status: 200,
    headers: { 'X-Handler-Ms': String(durasi) },
  });
}
