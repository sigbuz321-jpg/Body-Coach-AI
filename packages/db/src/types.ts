export type Goal = 'bulk' | 'cut' | 'maintain';
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';
export type LogSource = 'wa_text' | 'wa_photo' | 'web' | 'recommendation';
export type MatchStage = 'alias' | 'trigram' | 'vector' | 'generic' | 'user';

export interface UserRow {
  id: string;
  email: string | null;
  wa_id: string | null;
  wa_linked_at: Date | null;
  locale: string;
  timezone: string;
  created_at: Date;
  deleted_at: Date | null;
}

export interface LinkTokenRow {
  token: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}

export interface ProfileInput {
  userId: string;
  displayName: string | null;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  startWeightKg: number;
  targetWeightKg: number;
  goal: Goal;
  activity: ActivityLevel;
  gymPerWeek: number;
  foodPrefs: string[];
  budgetPerMeal: number | null;
  medicalFlags: string[];
  conservativeMode: boolean;
  consentHealthDataAt: Date | null;
}

export interface TargetVersionInput {
  userId: string;
  effectiveFrom: string; // ISO date, YYYY-MM-DD
  goal: Goal;
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  weeklyRateKg: number;
  reason: 'onboarding' | 'recalibration' | 'user_edit' | 'goal_change';
  engineVersion: string;
}

export interface TargetVersionRow {
  id: string;
  user_id: string;
  effective_from: string;
  goal: Goal;
  bmr: number;
  tdee: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  weekly_rate_kg: string;
  reason: string;
  engine_version: string;
  created_at: Date;
}

export interface FoodItemRow {
  id: string;
  name_id: string;
  name_en: string | null;
  category: string;
  cuisine: string;
  kcal_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
  source: string;
  verified: boolean;
}

export interface FoodMatch extends FoodItemRow {
  similarity: number;
}

/**
 * Makanan + porsi defaultnya. Kolom numeric dikembalikan driver sebagai string
 * (presisi arbitrer tidak muat di `number` tanpa kehilangan), jadi konversi
 * dilakukan sekali di lapisan pemanggil, bukan diam-diam di sini.
 */
export interface FoodWithPortion {
  name_id: string;
  kcal_per_100g: string;
  protein_per_100g: string;
  verified: boolean;
  portion_label: string;
  portion_grams: string;
}

export interface FoodPortionRow {
  id: string;
  food_item_id: string;
  label: string;
  grams: string;
  is_default: boolean;
}
