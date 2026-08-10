import { ACTIVITY_FACTOR, ACTIVITY_FACTOR_MAX, GYM_BONUS, BMI_UNDERWEIGHT } from './constants';
import type { ActivityLevel, Profile } from './types';

/**
 * BMR — Mifflin-St Jeor (docs/02-technical-spec.md §4.2 langkah 1).
 *
 * `currentYear` diminta eksplisit, tidak dibaca dari jam sistem. Fungsi murni
 * tidak boleh punya hasil yang berubah sendiri di pergantian tahun; tanpa ini
 * snapshot profil referensi akan bergeser tiap 1 Januari.
 */
export function computeBmr(p: Profile, currentYear: number): number {
  const age = currentYear - p.birthYear;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
  return Math.round(p.sex === 'male' ? base + 5 : base - 161);
}

/** Bonus gym, dibatasi pada 7 sesi per minggu. Di atas itu tidak menambah apa pun. */
export function gymBonus(gymPerWeek: number): number {
  const index = Math.min(Math.max(Math.trunc(gymPerWeek), 0), GYM_BONUS.length - 1);
  return GYM_BONUS[index] ?? 0;
}

export function activityFactor(activity: ActivityLevel, gymPerWeek: number): number {
  return Math.min(ACTIVITY_FACTOR[activity] + gymBonus(gymPerWeek), ACTIVITY_FACTOR_MAX);
}

/** TDEE — BMR × activity factor gabungan (§4.2 langkah 2). */
export function computeTdee(bmr: number, p: Profile): number {
  return Math.round(bmr * activityFactor(p.activity, p.gymPerWeek));
}

export function bmi(weightKg: number, heightCm: number): number {
  return weightKg / (heightCm / 100) ** 2;
}

export function isUnderweight(weightKg: number, heightCm: number): boolean {
  return bmi(weightKg, heightCm) < BMI_UNDERWEIGHT;
}
