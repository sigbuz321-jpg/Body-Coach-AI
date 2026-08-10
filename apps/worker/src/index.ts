/**
 * @bodycoach/worker — job runtime (Inngest/Trigger).
 *
 * Semua pemanggilan AI terjadi di sini, tidak pernah di dalam handler webhook
 * (AD-2). Job terjadwal ada di docs/02-technical-spec.md §8.
 *
 * Isi menyusul di M5: functions/message-received.ts (concurrency key = userId).
 */

import { CORE_PACKAGE } from '@bodycoach/core';
import { DB_PACKAGE } from '@bodycoach/db';

export const WORKER_APP = '@bodycoach/worker' as const;

/** Daftar package yang sudah tersambung — dipakai untuk verifikasi M0. */
export const WIRED_PACKAGES = [CORE_PACKAGE, DB_PACKAGE] as const;
