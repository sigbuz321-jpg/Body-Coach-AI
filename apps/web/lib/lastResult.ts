import type { Goal } from '@bodycoach/core';

/**
 * Snapshot rencana yang disimpan di sessionStorage saat submit sukses.
 *
 * Dipakai oleh /onboarding/rencana dan /onboarding/sambungkan agar alur
 * tetap koheren setelah navigasi. Tidak dipakai setelah user menutup tab —
 * itu memang tujuan sessionStorage.
 */

export interface OnboardingPlan {
  readonly goal: Goal;
  readonly currentWeightKg: number;
  readonly targetWeightKg: number;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  readonly weeklyKg: number;
  readonly engineVersion: string;
}

export interface LastResult {
  readonly plan: OnboardingPlan;
  readonly linkToken: string;
}

const KEY = 'bodycoach.lastResult.v1';

export function readLastResult(): LastResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastResult;
    if (!parsed.plan || !parsed.linkToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastResult(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Abaikan.
  }
}
