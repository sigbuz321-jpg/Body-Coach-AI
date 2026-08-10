import type { ActivityLevel, Goal, Sex } from '@bodycoach/core';

/**
 * Skema data wizard onboarding. Dipakai oleh halaman /onboarding dan
 * dikirim ke API /api/onboarding setelah consent dicentang.
 *
 * Nama kolom `camelCase` cocok dengan tipe domain `Profile` di core.
 * `conservativeMode` di sini tidak dipakai UI — engine menentukannya dari
 * guardrail; field ini disimpan agar konsisten dengan tipe Profile.
 */

export type FoodPreference =
  'halal' | 'no_pork' | 'no_seafood' | 'vegetarian' | 'no_dairy' | 'none';

export type BudgetPerMeal = 'under_15k' | '15_30k' | '30_50k' | 'over_50k' | null;

export interface OnboardingState {
  readonly goal: Goal | null;
  readonly sex: Sex | null;
  readonly birthYear: number | null;
  readonly heightCm: number | null;
  readonly weightKg: number | null;
  readonly targetWeightKg: number | null;
  readonly activity: ActivityLevel | null;
  readonly gymPerWeek: number | null;
  readonly preferences: readonly FoodPreference[];
  readonly budget: BudgetPerMeal;
  readonly displayName: string | null;
}

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  goal: null,
  sex: null,
  birthYear: null,
  heightCm: null,
  weightKg: null,
  targetWeightKg: null,
  activity: null,
  gymPerWeek: null,
  preferences: [],
  budget: null,
  displayName: null,
};

export const SESSION_KEY = 'bodycoach.onboarding.v1';

/**
 * Payload yang dikirim ke API. Hanya kolom-kolom yang diperlukan server;
 * field internal (seperti displayName) tidak ikut.
 */
export interface OnboardingSubmitPayload {
  readonly goal: Goal;
  readonly sex: Sex;
  readonly birthYear: number;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly targetWeightKg: number;
  readonly activity: ActivityLevel;
  readonly gymPerWeek: number;
  readonly preferences: readonly FoodPreference[];
  readonly budgetPerMealIdr: number | null;
  readonly displayName: string | null;
}

/**
 * Memetakan budget chip ke nilai IDR (titik tengah rentang). Dipakai saat
 * submit agar rekomendasi makanan di WhatsApp bisa disesuaikan dengan daya
 * beli — logikanya ringan, sengaja deterministic dan ditest.
 */
export function budgetToIdr(b: BudgetPerMeal): number | null {
  switch (b) {
    case 'under_15k':
      return 15_000;
    case '15_30k':
      return 22_500;
    case '30_50k':
      return 40_000;
    case 'over_50k':
      return 55_000;
    case null:
      return null;
  }
}

/**
 * Membangun payload dari state wizard. Mengembalikan `null` bila input
 * belum lengkap — klien menyebut ini untuk menentukan apakah tombol
 * "Buat rencana saya" boleh aktif.
 */
export function buildSubmitPayload(state: OnboardingState): OnboardingSubmitPayload | null {
  if (
    state.goal === null ||
    state.sex === null ||
    state.birthYear === null ||
    state.heightCm === null ||
    state.weightKg === null ||
    state.targetWeightKg === null ||
    state.activity === null ||
    state.gymPerWeek === null
  ) {
    return null;
  }
  return {
    goal: state.goal,
    sex: state.sex,
    birthYear: state.birthYear,
    heightCm: state.heightCm,
    weightKg: state.weightKg,
    targetWeightKg: state.targetWeightKg,
    activity: state.activity,
    gymPerWeek: state.gymPerWeek,
    preferences: state.preferences,
    budgetPerMealIdr: budgetToIdr(state.budget),
    displayName: state.displayName,
  };
}
