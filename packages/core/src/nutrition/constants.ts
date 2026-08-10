import type { Goal, Sex, ActivityLevel } from './types';

/** Sumber seluruh angka di file ini: docs/02-technical-spec.md §4.1. */

export const ACTIVITY_FACTOR: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

/** Penyesuaian frekuensi gym di atas activity factor dasar. Indeks = sesi per minggu, 0–7. */
export const GYM_BONUS = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.12] as const;

/** Batas atas activity factor gabungan, berapa pun kombinasinya. */
export const ACTIVITY_FACTOR_MAX = 1.9;

/** Laju perubahan berat mingguan sebagai fraksi berat badan. */
export const RATE: Readonly<Record<Goal, { min: number; default: number; max: number }>> = {
  bulk: { min: 0.002, default: 0.0035, max: 0.005 },
  cut: { min: 0.005, default: 0.0075, max: 0.01 },
  maintain: { min: 0, default: 0, max: 0 },
};

/** Perkiraan energi per kg jaringan campuran. */
export const KCAL_PER_KG_BW = 7700;

export const KCAL_FLOOR: Readonly<Record<Sex, number>> = { male: 1500, female: 1200 };

/** Kalori tidak boleh turun di bawah BMR dikali angka ini. */
export const BMR_FLOOR_MULTIPLIER = 1.05;

/** Mode konservatif menahan defisit maksimal 15% dari TDEE. */
export const CONSERVATIVE_TDEE_FLOOR = 0.85;

export const PROTEIN_G_PER_KG: Readonly<Record<Goal, number>> = {
  bulk: 1.8,
  cut: 2.2,
  maintain: 1.8,
};
export const PROTEIN_G_PER_KG_MAX = 2.6;

export const FAT_PCT_OF_KCAL = 0.25;
export const FAT_G_PER_KG_MIN = 0.6;

export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARBS = 4;
export const KCAL_PER_G_FAT = 9;

/** Ambang BMI kurang berat badan (WHO). */
export const BMI_UNDERWEIGHT = 18.5;

/** Selisih berat di atas fraksi ini dianggap ekstrem dan dipecah bertahap. */
export const EXTREME_DELTA_FRACTION = 0.4;

/** Kepatuhan tercatat minimum sebelum target boleh dikalibrasi ulang. */
export const RECALIBRATION_MIN_ADHERENCE = 0.7;

/** Alpha EMA berat badan. */
export const WEIGHT_EMA_ALPHA = 0.25;

/** Selisih laju aktual vs target yang memicu rekalibrasi, sebagai fraksi berat. */
export const RECALIBRATION_RATE_TOLERANCE = 0.0025;

/** Berapa minggu berturut-turut penyimpangan harus bertahan. */
export const RECALIBRATION_CONSECUTIVE_WEEKS = 2;

/** Besar penyesuaian kalori saat rekalibrasi. */
export const RECALIBRATION_STEP_KCAL = { min: 100, max: 150 } as const;

/**
 * Dicatat di setiap baris target_versions. Naikkan setiap kali perubahan di
 * modul ini mengubah angka yang dihasilkan, supaya target lama tetap bisa
 * dijelaskan asal-usulnya.
 */
export const ENGINE_VERSION = 'nutrition@1.0.0';

/** Rentang tampilan timeline: kepatuhan tidak pernah 100%. */
export const TIMELINE_SPREAD = { min: 0.85, max: 1.35 } as const;
