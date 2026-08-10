import {
  BMR_FLOOR_MULTIPLIER,
  CONSERVATIVE_TDEE_FLOOR,
  KCAL_FLOOR,
  RATE,
  RECALIBRATION_CONSECUTIVE_WEEKS,
  RECALIBRATION_MIN_ADHERENCE,
  RECALIBRATION_RATE_TOLERANCE,
  RECALIBRATION_STEP_KCAL,
  WEIGHT_EMA_ALPHA,
} from './constants';
import type { Profile, TargetSet } from './types';

/** Satu minggu pengamatan. `weights` boleh tidak lengkap — orang lupa menimbang. */
export interface WeekObservation {
  readonly weights: readonly number[];
  /** Fraksi hari yang tercatat pada minggu itu, 0..1. */
  readonly adherence: number;
}

export type HoldReason = 'insufficient_data' | 'low_adherence' | 'on_track' | 'not_persistent';

export type RecalibrationDecision =
  | { readonly kind: 'hold'; readonly reason: HoldReason }
  | {
      readonly kind: 'adjust';
      readonly deltaKcal: number;
      readonly newKcal: number;
      readonly actualRate: number;
      readonly expectedRate: number;
    };

/**
 * Exponential moving average. Menonjolkan tren dan meredam noise harian —
 * berat badan berayun 1–2 kg karena air dan isi perut, dan menanggapi ayunan
 * itu akan membuat target berubah-ubah tanpa alasan.
 */
export function ema(values: readonly number[], alpha: number = WEIGHT_EMA_ALPHA): number | null {
  if (values.length === 0) return null;
  let acc = values[0] as number;
  for (let i = 1; i < values.length; i += 1) {
    acc = alpha * (values[i] as number) + (1 - alpha) * acc;
  }
  return acc;
}

/** Laju perubahan mingguan sebagai fraksi berat, dari dua jendela berurutan. */
export function weeklyRate(previous: WeekObservation, current: WeekObservation): number | null {
  const prev = ema(previous.weights);
  const now = ema(current.weights);
  if (prev === null || now === null || prev === 0) return null;
  return (now - prev) / prev;
}

function expectedRateFor(goal: Profile['goal']): number {
  return RATE[goal].default * (goal === 'cut' ? -1 : 1);
}

/** Safety rail yang sama seperti langkah 5 computeTargets. Rekalibrasi tidak boleh menembusnya. */
function clampToSafetyRails(kcal: number, p: Profile, target: TargetSet): number {
  let out = Math.max(kcal, KCAL_FLOOR[p.sex], Math.round(target.bmr * BMR_FLOOR_MULTIPLIER));
  if (p.conservativeMode) {
    out = Math.max(out, Math.round(target.tdee * CONSERVATIVE_TDEE_FLOOR));
  }
  return out;
}

/**
 * Rekalibrasi mingguan (docs/01-system-design.md §4.5).
 *
 * `weeks` diurutkan dari lama ke terbaru dan harus memuat minimal satu jendela
 * lebih banyak daripada jumlah minggu berturut-turut yang disyaratkan, karena
 * setiap laju dihitung dari sepasang jendela.
 */
export function evaluateRecalibration(
  p: Profile,
  target: TargetSet,
  weeks: readonly WeekObservation[],
): RecalibrationDecision {
  if (weeks.length < RECALIBRATION_CONSECUTIVE_WEEKS + 1) {
    return { kind: 'hold', reason: 'insufficient_data' };
  }

  const recent = weeks.slice(-(RECALIBRATION_CONSECUTIVE_WEEKS + 1));

  // Guard adherence. Tanpa ini sistem menaikkan kalori pengguna yang sebenarnya
  // hanya lupa mencatat — kesalahan yang menumpuk diam-diam selama berminggu-minggu.
  const observed = recent.slice(1);
  if (observed.some((w) => w.adherence < RECALIBRATION_MIN_ADHERENCE)) {
    return { kind: 'hold', reason: 'low_adherence' };
  }

  const rates: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    const rate = weeklyRate(recent[i - 1] as WeekObservation, recent[i] as WeekObservation);
    if (rate === null) return { kind: 'hold', reason: 'insufficient_data' };
    rates.push(rate);
  }

  const expectedRate = expectedRateFor(p.goal);
  const gaps = rates.map((r) => expectedRate - r);

  // Penyimpangan harus bertahan, dan ke arah yang sama. Satu minggu meleset
  // adalah noise; dua minggu meleset ke arah yang sama adalah sinyal.
  const allOverTolerance = gaps.every((g) => Math.abs(g) > RECALIBRATION_RATE_TOLERANCE);
  if (!allOverTolerance) return { kind: 'hold', reason: 'on_track' };

  const sameDirection = gaps.every((g) => Math.sign(g) === Math.sign(gaps[0] as number));
  if (!sameDirection) return { kind: 'hold', reason: 'not_persistent' };

  const latestGap = gaps[gaps.length - 1] as number;
  const magnitude =
    Math.abs(latestGap) > RECALIBRATION_RATE_TOLERANCE * 2
      ? RECALIBRATION_STEP_KCAL.max
      : RECALIBRATION_STEP_KCAL.min;

  const proposed = target.kcal + Math.sign(latestGap) * magnitude;
  const newKcal = clampToSafetyRails(proposed, p, target);

  const actualRate = rates[rates.length - 1] as number;
  if (newKcal === target.kcal) return { kind: 'hold', reason: 'on_track' };

  return {
    kind: 'adjust',
    deltaKcal: newKcal - target.kcal,
    newKcal,
    actualRate,
    expectedRate,
  };
}
