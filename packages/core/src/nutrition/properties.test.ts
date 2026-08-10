import { describe, expect, it } from 'vitest';

import { KCAL_FLOOR, PROTEIN_G_PER_KG_MAX } from './constants';
import { TEST_YEAR } from './fixtures';
import { evaluateProfile, validateGoal } from './guardrail';
import { macroEnergy, computeTargets } from './targets';
import type { ActivityLevel, Goal, Profile, Sex } from './types';

const ITERATIONS = 10_000;

/**
 * PRNG dengan seed tetap. Bukan Math.random: kegagalan harus dapat diulang
 * persis, kalau tidak temuannya hilang begitu test dijalankan lagi.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const SEXES: readonly Sex[] = ['male', 'female'];
const GOALS: readonly Goal[] = ['bulk', 'cut', 'maintain'];
const ACTIVITIES: readonly ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'high',
  'very_high',
];

function makeProfile(rand: () => number): Profile {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  // Rentang mengikuti CHECK constraint di packages/db/migrations/0001_init.sql,
  // jadi profil yang diuji di sini adalah profil yang benar-benar bisa tersimpan.
  const heightCm = Math.round(between(120, 230) * 10) / 10;
  const weightKg = Math.round(between(30, 300) * 100) / 100;
  const goal = pick(GOALS);

  const delta = between(0.01, 0.35) * weightKg;
  const targetWeightKg =
    goal === 'bulk' ? weightKg + delta : goal === 'cut' ? weightKg - delta : weightKg;

  return {
    sex: pick(SEXES),
    birthYear: TEST_YEAR - Math.floor(between(15, 80)),
    heightCm,
    weightKg,
    targetWeightKg: Math.max(30, Math.round(targetWeightKg * 100) / 100),
    goal,
    activity: pick(ACTIVITIES),
    gymPerWeek: Math.floor(between(0, 15)),
    conservativeMode: rand() < 0.2,
    medicalFlags: rand() < 0.1 ? ['diabetes'] : [],
  };
}

describe(`property test — ${ITERATIONS.toLocaleString('id-ID')} profil acak`, () => {
  it('setiap invariant §4.4 terpenuhi', () => {
    const rand = mulberry32(20260811);
    let evaluated = 0;
    let blocked = 0;

    for (let i = 0; i < ITERATIONS; i += 1) {
      const p = makeProfile(rand);

      if (validateGoal(p).kind === 'block') {
        blocked += 1;
        continue;
      }
      evaluated += 1;

      const t = computeTargets(p, TEST_YEAR);
      const where = `profil #${i}: ${JSON.stringify(p)} → ${JSON.stringify(t)}`;

      expect(t.kcal, `kcal di bawah floor jenis kelamin — ${where}`).toBeGreaterThanOrEqual(
        KCAL_FLOOR[p.sex],
      );
      expect(t.kcal, `kcal di bawah BMR×1,05 — ${where}`).toBeGreaterThanOrEqual(
        Math.round(t.bmr * 1.05),
      );
      expect(t.carbsG, `karbo negatif — ${where}`).toBeGreaterThanOrEqual(0);
      expect(t.proteinG, `protein di atas 2,6 g/kg — ${where}`).toBeLessThanOrEqual(
        PROTEIN_G_PER_KG_MAX * p.weightKg,
      );
      expect(
        macroEnergy(t.proteinG, t.fatG),
        `protein+lemak melebihi kkal — ${where}`,
      ).toBeLessThanOrEqual(t.kcal);
      expect(Number.isFinite(t.kcal), `kcal bukan angka berhingga — ${where}`).toBe(true);
    }

    // Kalau generator berubah dan berhenti menghasilkan profil yang bisa
    // dihitung, test di atas jadi hijau tanpa menguji apa pun.
    expect(evaluated).toBeGreaterThan(ITERATIONS * 0.5);
    expect(evaluated + blocked).toBe(ITERATIONS);
  });

  it('profil yang diblokir tidak pernah menghasilkan angka', () => {
    const rand = mulberry32(777);
    let blocked = 0;

    for (let i = 0; i < ITERATIONS; i += 1) {
      const p = makeProfile(rand);
      const result = evaluateProfile(p);
      if (result.kind !== 'blocked') continue;
      blocked += 1;

      const serialized = JSON.stringify(result);
      expect(serialized, `hasil block memuat angka — profil #${i}`).not.toMatch(/\d/);
    }

    expect(blocked).toBeGreaterThan(0);
  });
});
