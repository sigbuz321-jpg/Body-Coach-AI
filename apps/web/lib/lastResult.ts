import type { Goal } from '@bodycoach/core';

/**
 * Snapshot rencana yang disimpan di sessionStorage saat submit sukses.
 *
 * Dipakai oleh /rencana dan /sambungkan agar alur tetap koheren setelah
 * navigasi. Tidak dipakai setelah user menutup tab — itu memang tujuan
 * sessionStorage.
 *
 * Isinya adalah respons server apa adanya. Tidak ada angka yang dihitung
 * ulang di klien: `timeline` pun datang dari engine (AD-1).
 */

export interface PlanTimeline {
  readonly minWeeks: number;
  readonly maxWeeks: number;
}

export interface OnboardingPlan {
  readonly goal: Goal;
  readonly currentWeightKg: number;
  readonly targetWeightKg: number;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly weeklyKg: number;
  /** `null` untuk maintain / laju nol — bukan nol minggu. */
  readonly timeline: PlanTimeline | null;
  readonly engineVersion: string;
}

export interface LastResult {
  readonly plan: OnboardingPlan;
  readonly linkToken: string;
  /**
   * Deep link `wa.me` yang dirakit server. `null` bila nomor bisnis belum
   * dikonfigurasi — layar sambungkan menampilkan keadaannya apa adanya.
   */
  readonly waUrl: string | null;
}

/**
 * v3: bertambah `waUrl`, yang sebelumnya dirakit di klien dari env var yang
 * tidak pernah ada. Kunci dinaikkan supaya tab yang masih memegang snapshot
 * lama tidak dibaca dengan tipe yang salah.
 */
export const LAST_RESULT_KEY = 'bodycoach.lastResult.v3';

export function readLastResult(): LastResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastResult;
    if (!parsed.plan || !parsed.linkToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastResult(result: LastResult): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
  } catch {
    // Kuota penuh / mode privat. Halaman rencana akan menampilkan state
    // "belum ada rencana" — datanya sendiri sudah aman di database.
  }
}

export function clearLastResult(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LAST_RESULT_KEY);
  } catch {
    // Abaikan.
  }
}
