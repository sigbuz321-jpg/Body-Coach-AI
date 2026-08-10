import { describe, expect, it } from 'vitest';

import { ENGINE_VERSION, KCAL_FLOOR, PROTEIN_G_PER_KG_MAX } from './constants';
import { profile, TEST_YEAR } from './fixtures';
import { computeTargets, macroEnergy } from './targets';

describe('computeTargets', () => {
  it('bulk menghasilkan surplus di atas TDEE', () => {
    const t = computeTargets(profile({ goal: 'bulk' }), TEST_YEAR);
    expect(t.kcal).toBeGreaterThan(t.tdee);
    expect(t.weeklyKg).toBeGreaterThan(0);
  });

  it('cut menghasilkan defisit di bawah TDEE', () => {
    const t = computeTargets(
      profile({ goal: 'cut', weightKg: 85, targetWeightKg: 75, birthYear: TEST_YEAR - 28 }),
      TEST_YEAR,
    );
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(t.weeklyKg).toBeLessThan(0);
  });

  it('maintain mendarat di TDEE dengan laju nol', () => {
    const p = profile({ goal: 'maintain', weightKg: 70, targetWeightKg: 70 });
    const t = computeTargets(p, TEST_YEAR);
    expect(t.weeklyKg).toBe(0);
    expect(t.kcal).toBe(t.tdee);
  });

  it('protein bulk memakai berat saat ini', () => {
    const t = computeTargets(
      profile({ goal: 'bulk', weightKg: 63, targetWeightKg: 70 }),
      TEST_YEAR,
    );
    expect(t.proteinG).toBe(Math.round(1.8 * 63));
  });

  it('protein cut memakai berat yang lebih rendah antara sekarang dan target', () => {
    const t = computeTargets(profile({ goal: 'cut', weightKg: 85, targetWeightKg: 75 }), TEST_YEAR);
    expect(t.proteinG).toBe(Math.round(2.2 * 75));
  });

  it('menandai versi engine di setiap hasil', () => {
    expect(computeTargets(profile(), TEST_YEAR).engineVersion).toBe(ENGINE_VERSION);
  });
});

describe('safety clamp', () => {
  it('wanita tidak pernah turun di bawah 1200 kkal', () => {
    const p = profile({
      sex: 'female',
      heightCm: 160,
      weightKg: 60,
      targetWeightKg: 55,
      goal: 'cut',
      activity: 'sedentary',
      gymPerWeek: 3,
      birthYear: TEST_YEAR - 25,
    });
    const t = computeTargets(p, TEST_YEAR);
    expect(t.kcal).toBeGreaterThanOrEqual(KCAL_FLOOR.female);
  });

  it('tidak pernah turun di bawah BMR × 1,05', () => {
    const p = profile({
      sex: 'female',
      heightCm: 150,
      weightKg: 95,
      targetWeightKg: 70,
      goal: 'cut',
      activity: 'sedentary',
      birthYear: TEST_YEAR - 55,
      gymPerWeek: 0,
    });
    const t = computeTargets(p, TEST_YEAR);
    expect(t.kcal).toBeGreaterThanOrEqual(Math.round(t.bmr * 1.05));
  });

  it('mode konservatif menahan defisit di 15% dari TDEE', () => {
    // Aktivitas harus cukup tinggi agar batas 85% TDEE mengikat lebih dulu
    // daripada clamp BMR × 1,05; kalau tidak, mode konservatif tidak mengubah apa pun.
    const base = profile({
      goal: 'cut',
      weightKg: 95,
      targetWeightKg: 80,
      activity: 'high',
      gymPerWeek: 0,
      birthYear: TEST_YEAR - 30,
    });
    const normal = computeTargets(base, TEST_YEAR);
    const careful = computeTargets({ ...base, conservativeMode: true }, TEST_YEAR);

    expect(careful.kcal).toBeGreaterThanOrEqual(Math.round(careful.tdee * 0.85));
    expect(careful.kcal).toBeGreaterThan(normal.kcal);
  });
});

describe('makro', () => {
  it('lemak mengikuti 25% kalori ketika itu yang lebih besar', () => {
    const t = computeTargets(profile({ goal: 'bulk', weightKg: 63 }), TEST_YEAR);
    expect(t.fatG).toBe(Math.round((t.kcal * 0.25) / 9));
  });

  it('lemak jatuh ke batas bawah 0,6 g/kg untuk tubuh berat berkalori rendah', () => {
    const p = profile({
      sex: 'female',
      heightCm: 150,
      weightKg: 110,
      targetWeightKg: 80,
      goal: 'cut',
      activity: 'sedentary',
      gymPerWeek: 0,
      birthYear: TEST_YEAR - 60,
    });
    const t = computeTargets(p, TEST_YEAR);
    expect(t.fatG).toBe(Math.round(0.6 * 110));
  });

  it('karbo mengisi sisa setelah protein dan lemak', () => {
    const t = computeTargets(profile(), TEST_YEAR);
    expect(t.carbsG).toBe(Math.round((t.kcal - macroEnergy(t.proteinG, t.fatG)) / 4));
  });

  it('protein tidak pernah melewati 2,6 g per kg berat badan', () => {
    const p = profile({ goal: 'cut', weightKg: 60, targetWeightKg: 55 });
    const t = computeTargets(p, TEST_YEAR);
    expect(t.proteinG).toBeLessThanOrEqual(PROTEIN_G_PER_KG_MAX * p.weightKg);
  });

  it('menaikkan kalori ketika protein dan lemak minimum saja sudah melebihinya', () => {
    // Profil yang menemukan celah di §4.2: kalori ditahan clamp BMR×1,05,
    // sementara protein 2,2 g/kg dan lemak 0,6 g/kg sudah melampauinya.
    const p = profile({
      sex: 'female',
      heightCm: 120,
      weightKg: 100,
      targetWeightKg: 90,
      goal: 'cut',
      activity: 'sedentary',
      gymPerWeek: 0,
      birthYear: TEST_YEAR - 65,
    });
    const t = computeTargets(p, TEST_YEAR);

    expect(macroEnergy(t.proteinG, t.fatG)).toBeLessThanOrEqual(t.kcal);
    expect(t.carbsG).toBe(0);
    // Kalori tetap tidak pernah turun di bawah safety rail mana pun.
    expect(t.kcal).toBeGreaterThanOrEqual(Math.round(t.bmr * 1.05));
  });
});
