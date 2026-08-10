import { bmi } from './bmr';
import { BMI_UNDERWEIGHT, EXTREME_DELTA_FRACTION } from './constants';
import type { Goal, Profile } from './types';

export type BlockReason = 'cut_underweight' | 'target_underweight' | 'goal_mismatch';
export type WarnReason = 'extreme_delta' | 'medical_flag';

/**
 * Hasil guardrail.
 *
 * Varian `block` sengaja tidak punya satu pun field numerik. Aturannya —
 * "setiap hasil block tidak boleh mengembalikan angka kalori apa pun"
 * (CLAUDE.md) — ditegakkan oleh bentuk tipe ini, bukan oleh kedisiplinan
 * pemanggil. Tidak ada angka untuk dibocorkan karena tidak ada tempatnya.
 */
export type GuardrailResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'warn'; readonly reasons: readonly WarnReason[] }
  | {
      readonly kind: 'block';
      readonly reason: BlockReason;
      /** Goal yang boleh ditawarkan sebagai jalan keluar. */
      readonly alternatives: readonly Goal[];
    };

const ALTERNATIVES: Readonly<Record<BlockReason, readonly Goal[]>> = {
  cut_underweight: ['maintain', 'bulk'],
  target_underweight: ['maintain'],
  goal_mismatch: ['maintain'],
};

function block(reason: BlockReason): GuardrailResult {
  return { kind: 'block', reason, alternatives: ALTERNATIVES[reason] };
}

/**
 * Dijalankan sebelum engine dipanggil (docs/02-technical-spec.md §4.3).
 *
 * [DEVIASI] §4.3 mengembalikan satu warn dan berhenti di kecocokan pertama,
 * sehingga `medical_flag` tertutup oleh `extreme_delta` bagi pengguna yang
 * mengalami keduanya. Itu berakibat nyata: `medical_flag` yang menyalakan
 * mode konservatif. Di sini semua warn dikumpulkan.
 */
export function validateGoal(p: Profile): GuardrailResult {
  const currentBmi = bmi(p.weightKg, p.heightCm);
  const targetBmi = bmi(p.targetWeightKg, p.heightCm);

  if (currentBmi < BMI_UNDERWEIGHT && p.goal === 'cut') return block('cut_underweight');
  if (targetBmi < BMI_UNDERWEIGHT) return block('target_underweight');
  if (p.goal === 'cut' && p.targetWeightKg >= p.weightKg) return block('goal_mismatch');
  if (p.goal === 'bulk' && p.targetWeightKg <= p.weightKg) return block('goal_mismatch');

  const reasons: WarnReason[] = [];
  if (Math.abs(p.targetWeightKg - p.weightKg) / p.weightKg > EXTREME_DELTA_FRACTION) {
    reasons.push('extreme_delta');
  }
  if (p.medicalFlags.length > 0) {
    reasons.push('medical_flag');
  }

  return reasons.length > 0 ? { kind: 'warn', reasons } : { kind: 'ok' };
}

/** Klaim kondisi medis menyalakan mode konservatif (docs/01-system-design.md §6.4). */
export function requiresConservativeMode(result: GuardrailResult): boolean {
  return result.kind === 'warn' && result.reasons.includes('medical_flag');
}

/**
 * Satu-satunya jalan dari profil ke angka. Kalau guardrail memblokir, tidak
 * ada TargetSet yang dikembalikan — pemanggil tidak punya angka untuk
 * ditampilkan sekalipun ingin.
 */
export type PlanResult =
  | { readonly kind: 'blocked'; readonly guardrail: Extract<GuardrailResult, { kind: 'block' }> }
  | { readonly kind: 'ready'; readonly guardrail: GuardrailResult; readonly conservative: boolean };

export function evaluateProfile(p: Profile): PlanResult {
  const guardrail = validateGoal(p);
  if (guardrail.kind === 'block') return { kind: 'blocked', guardrail };
  return { kind: 'ready', guardrail, conservative: requiresConservativeMode(guardrail) };
}
