import type { Goal } from '../nutrition/types';

/**
 * Tipe untuk lapisan coach. Semuanya data biasa — tidak ada koneksi,
 * tidak ada klien HTTP. Yang mengambil datanya adalah worker.
 */

export interface DailyTotals {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
}

export interface DailyTarget extends DailyTotals {
  readonly goal: Goal;
}

/** Slot makan menurut jam WIB. Dipakai coach untuk menyarankan yang masuk akal. */
export type MealSlot = 'sarapan' | 'makan_siang' | 'makan_malam' | 'snack';

export interface CoachContext {
  readonly displayName: string | null;
  readonly goal: Goal;
  readonly currentWeightKg: number;
  readonly targetWeightKg: number;
  readonly target: DailyTarget;
  readonly consumed: DailyTotals;
  /** Jam lokal WIB 0–23, sudah dihitung pemanggil. Engine tidak membaca jam. */
  readonly hourWib: number;
  readonly foodPrefs: readonly string[];
  readonly budgetPerMealIdr: number | null;
  /** Berat 7 hari terakhir (EMA) — awal dan akhir. `null` bila belum cukup data. */
  readonly weightTrend: { readonly from: number; readonly to: number } | null;
  /** Jumlah hari tercatat dari 7 hari terakhir. */
  readonly adherenceDays: number;
}

/** Sisa target hari ini. Tidak pernah negatif di bawah nol untuk tampilan. */
export interface Remaining extends DailyTotals {
  /** True bila konsumsi sudah melewati target kalori. */
  readonly overKcal: boolean;
}
