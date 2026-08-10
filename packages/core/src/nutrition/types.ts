export type Goal = 'bulk' | 'cut' | 'maintain';
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';

/**
 * Masukan engine. Ini tipe domain, bukan baris database — `weightKg` adalah
 * berat saat ini, sedangkan `profiles.start_weight_kg` adalah berat saat
 * onboarding. Keduanya berbeda begitu pengguna menimbang ulang.
 */
export interface Profile {
  readonly sex: Sex;
  readonly birthYear: number;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly targetWeightKg: number;
  readonly goal: Goal;
  readonly activity: ActivityLevel;
  readonly gymPerWeek: number;
  readonly conservativeMode: boolean;
  readonly medicalFlags: readonly string[];
}

export interface TargetSet {
  readonly bmr: number;
  readonly tdee: number;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  /** Laju mingguan dalam kg. Positif untuk bulk, negatif untuk cut, 0 untuk maintain. */
  readonly weeklyKg: number;
  readonly engineVersion: string;
}

/**
 * Rentang, bukan tanggal. Kepatuhan tidak pernah 100%, dan menjanjikan
 * tanggal pasti adalah janji hasil — dilarang di CLAUDE.md.
 *
 * `null` berarti tidak dapat diperkirakan: maintain tidak menuju ke mana-mana.
 */
export interface TimelineRange {
  readonly minWeeks: number;
  readonly maxWeeks: number;
}
