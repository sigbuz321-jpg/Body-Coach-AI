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
  // `CRON_SECRET` ikut diterima karena itu nama yang dipakai Vercel Cron: ia
  // mengirim `Authorization: Bearer $CRON_SECRET` dan nama variabelnya tidak
  // bisa diganti. `WORKER_DRAIN_SECRET` untuk pemicu manual dan penjadwal lain.
  const rahasia = [process.env['WORKER_DRAIN_SECRET'], process.env['CRON_SECRET']].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  // Tidak ada rahasia sama sekali berarti belum dikonfigurasi. Sama seperti
  // webhook: menerima semua request dalam kondisi itu lebih berbahaya daripada
  // menolak semuanya — endpoint ini mengirim pesan atas nama nomor bisnis.
  if (rahasia.length === 0) return false;

  const header = req.headers.get('authorization') ?? '';
  return rahasia.some((s) => header === `Bearer ${s}`);
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
