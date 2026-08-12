import { dequeueMessage, type MessageJob } from '@bodycoach/db';
import { hashWaId } from '@bodycoach/whatsapp';

import {
  handleMessageReceived,
  type MessageDeps,
  type MessageOutcome,
} from './functions/message-received';

/**
 * Penguras antrean.
 *
 * Di Vercel tidak ada proses yang hidup terus, jadi "worker" di sini adalah
 * fungsi yang dipanggil berulang — oleh cron, oleh endpoint drain, atau oleh
 * simulator. Bentuknya sengaja dibuat berbatas: satu panggilan mengambil paling
 * banyak `maxJobs` job lalu berhenti, apa pun isi antrenya.
 *
 * Batas itu bukan kehati-hatian berlebihan. Job yang ditunda karena kunci
 * penggunanya sedang dipegang dikembalikan ke antrean; tanpa batas, satu
 * pengguna yang macet membuat loop ini berputar sampai timeout platform.
 */

export interface DrainOptions {
  /** Batas job per panggilan. Default sengaja kecil — cron memanggil lagi. */
  readonly maxJobs?: number;
  /** Batas waktu lunak; dicek antar job, bukan memotong job berjalan. */
  readonly budgetMs?: number;
}

export interface DrainReport {
  readonly processed: number;
  readonly deferred: number;
  readonly failed: number;
  readonly outcomes: readonly MessageOutcome[];
  readonly durationMs: number;
}

const DEFAULT_MAX_JOBS = 20;
const DEFAULT_BUDGET_MS = 50_000;

export async function drainQueue(deps: MessageDeps, opts: DrainOptions = {}): Promise<DrainReport> {
  const maxJobs = opts.maxJobs ?? DEFAULT_MAX_JOBS;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const mulai = Date.now();

  const outcomes: MessageOutcome[] = [];
  let deferred = 0;
  let failed = 0;

  for (let i = 0; i < maxJobs; i++) {
    if (Date.now() - mulai > budgetMs) break;

    const job: MessageJob | null = await dequeueMessage();
    if (!job) break;

    try {
      const hasil = await handleMessageReceived(deps, job);
      outcomes.push(hasil);
      if (hasil.kind === 'deferred') deferred++;
    } catch (err) {
      // Satu job gagal tidak boleh menghentikan sisanya. Job-nya TIDAK
      // dikembalikan ke antrean: kegagalan di tengah pemrosesan berarti sebagian
      // efeknya mungkin sudah terjadi, dan mengulang dari awal berisiko
      // menghasilkan balasan ganda. Pesannya tetap terdedup di Redis, jadi
      // pengulangan hanya bisa datang dari pengguna sendiri.
      failed++;
      console.error('[drain] job gagal', hashWaId(job.waId), job.messageId, err);
    }
  }

  return {
    processed: outcomes.length,
    deferred,
    failed,
    outcomes,
    durationMs: Date.now() - mulai,
  };
}
