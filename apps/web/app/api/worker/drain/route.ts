import { createMessageDeps, drainQueue } from '@bodycoach/worker';

/**
 * Pemicu worker.
 *
 * [DEVIASI] `docs/01-system-design.md` §2 memilih Inngest/Trigger.dev. M5
 * belum memakainya: target deploy adalah Vercel, di mana tidak ada proses yang
 * hidup terus, dan antrean list Redis + endpoint ini sudah cukup untuk
 * memindahkan seluruh pekerjaan lambat keluar dari handler webhook (AD-2) —
 * yang memang inti aturannya. Menambah vendor orkestrasi sebelum ada satu pun
 * pesan nyata hanya menambah hal yang bisa rusak.
 *
 * Konsekuensi yang jujur: latensi balasan = jeda cron. Panggil setiap menit
 * lewat Vercel Cron, dan naikkan frekuensinya (atau pindah ke Inngest) begitu
 * ada pengguna yang benar-benar menunggu jawaban.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env['WORKER_DRAIN_SECRET'] ?? '';
  // Rahasia kosong berarti belum dikonfigurasi. Sama seperti webhook: menerima
  // semua request dalam kondisi itu lebih berbahaya daripada menolak semuanya —
  // endpoint ini mengirim pesan WhatsApp atas nama nomor bisnis.
  if (!secret) return false;

  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

async function jalankan(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response('unauthorized', { status: 401 });

  const report = await drainQueue(createMessageDeps());

  return Response.json({
    processed: report.processed,
    deferred: report.deferred,
    failed: report.failed,
    durationMs: report.durationMs,
  });
}

/** Vercel Cron memanggil dengan GET. */
export function GET(req: Request): Promise<Response> {
  return jalankan(req);
}

/** POST untuk pemicu manual dan alat lain. */
export function POST(req: Request): Promise<Response> {
  return jalankan(req);
}
