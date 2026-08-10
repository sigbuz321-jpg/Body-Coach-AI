import type { Profile } from './types';

/** Tahun acuan seluruh test. Tetap, supaya snapshot tidak bergeser tiap tahun. */
export const TEST_YEAR = 2026;

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    sex: 'male',
    birthYear: 2001,
    heightCm: 175,
    weightKg: 63,
    targetWeightKg: 70,
    goal: 'bulk',
    activity: 'moderate',
    gymPerWeek: 4,
    conservativeMode: false,
    medicalFlags: [],
    ...overrides,
  };
}
