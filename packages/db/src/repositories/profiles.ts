import type { Pool, PoolClient } from 'pg';

import type { ProfileInput, ProfileRow } from '../types';

type Q = Pool | PoolClient;

/**
 * Profil pengguna apa adanya dari database.
 *
 * Kolom numeric dikembalikan driver sebagai string; konversi ke `number`
 * dilakukan pemanggil, bukan diam-diam di sini (alasannya di `types.ts`).
 */
export async function getProfile(db: Q, userId: string): Promise<ProfileRow | null> {
  const { rows } = await db.query<ProfileRow>('SELECT * FROM profiles WHERE user_id = $1', [
    userId,
  ]);
  return rows[0] ?? null;
}

export async function upsertProfile(db: Q, p: ProfileInput): Promise<void> {
  await db.query(
    `INSERT INTO profiles (
       user_id, display_name, sex, birth_year, height_cm, start_weight_kg,
       target_weight_kg, goal, activity, gym_per_week, food_prefs,
       budget_per_meal, medical_flags, conservative_mode, consent_health_data_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       sex = EXCLUDED.sex,
       birth_year = EXCLUDED.birth_year,
       height_cm = EXCLUDED.height_cm,
       start_weight_kg = EXCLUDED.start_weight_kg,
       target_weight_kg = EXCLUDED.target_weight_kg,
       goal = EXCLUDED.goal,
       activity = EXCLUDED.activity,
       gym_per_week = EXCLUDED.gym_per_week,
       food_prefs = EXCLUDED.food_prefs,
       budget_per_meal = EXCLUDED.budget_per_meal,
       medical_flags = EXCLUDED.medical_flags,
       conservative_mode = EXCLUDED.conservative_mode,
       consent_health_data_at = COALESCE(profiles.consent_health_data_at, EXCLUDED.consent_health_data_at),
       updated_at = now()`,
    [
      p.userId,
      p.displayName,
      p.sex,
      p.birthYear,
      p.heightCm,
      p.startWeightKg,
      p.targetWeightKg,
      p.goal,
      p.activity,
      p.gymPerWeek,
      p.foodPrefs,
      p.budgetPerMeal,
      p.medicalFlags,
      p.conservativeMode,
      p.consentHealthDataAt,
    ],
  );
}
