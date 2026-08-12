/**
 * @bodycoach/worker — job runtime.
 *
 * Semua pemanggilan AI terjadi di sini, tidak pernah di dalam handler webhook
 * (AD-2). Job terjadwal ada di docs/02-technical-spec.md §8.
 *
 * [DEVIASI] Belum memakai Inngest/Trigger seperti di `docs/01-system-design.md`
 * §2. Antreannya list Redis dan pemicunya HTTP (`/api/worker/drain`), karena
 * target deploy M5 adalah Vercel dan menambah vendor orkestrasi sebelum ada
 * satu pun pesan nyata hanya menambah hal yang bisa rusak. Yang penting sudah
 * ada dan tidak berubah kalau nanti pindah: batas job per panggilan, kunci
 * concurrency per pengguna, dan idempotency dua lapis.
 */

import { CORE_PACKAGE } from '@bodycoach/core';
import { DB_PACKAGE } from '@bodycoach/db';

export const WORKER_APP = '@bodycoach/worker' as const;

/** Daftar package yang sudah tersambung — dipakai untuk verifikasi M0. */
export const WIRED_PACKAGES = [CORE_PACKAGE, DB_PACKAGE] as const;

export { createCoachRunner, createCoachRunnerIfConfigured } from './coach';
export { createMessageDeps } from './deps';
export { drainQueue } from './drain';
export type { DrainOptions, DrainReport } from './drain';
export { handleMessageReceived, MESSAGE_RECEIVED } from './functions/message-received';
export type {
  CoachAnswer,
  CoachRunner,
  LockManager,
  MessageDeps,
  MessageOutcome,
  Messenger,
  PairOutcome,
  Store,
} from './functions/message-received';
export { createStore } from './store';
