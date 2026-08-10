import { describe, expect, it } from 'vitest';

import { activityFactor, bmi, computeBmr, computeTdee, gymBonus, isUnderweight } from './bmr';
import { ACTIVITY_FACTOR_MAX } from './constants';
import { profile, TEST_YEAR } from './fixtures';

describe('computeBmr — Mifflin-St Jeor', () => {
  it('pria 25 tahun, 70 kg, 175 cm', () => {
    // 10(70) + 6,25(175) − 5(25) + 5 = 700 + 1093,75 − 125 + 5 = 1673,75 → 1674
    //
    // docs/02-technical-spec.md §4.4 menuliskan 1673, yaitu hasil pembulatan
    // ke bawah, sementara §4.2 memakai Math.round. Rumus di §4.2 yang dipakai
    // karena itulah kode yang dispesifikasikan.
    const p = profile({ sex: 'male', birthYear: TEST_YEAR - 25, weightKg: 70, heightCm: 175 });
    expect(computeBmr(p, TEST_YEAR)).toBe(1674);
  });

  it('wanita 25 tahun, 55 kg, 160 cm', () => {
    // 10(55) + 6,25(160) − 5(25) − 161 = 550 + 1000 − 125 − 161 = 1264
    //
    // §4.4 menuliskan 1257. Selisih 7 kkal tidak bisa dijelaskan oleh
    // pembulatan; angka di §4.4 tidak konsisten dengan rumus di §4.2.
    const p = profile({ sex: 'female', birthYear: TEST_YEAR - 25, weightKg: 55, heightCm: 160 });
    expect(computeBmr(p, TEST_YEAR)).toBe(1264);
  });

  it('tidak membaca jam sistem — tahun yang berbeda menghasilkan BMR berbeda', () => {
    const p = profile({ birthYear: 2000 });
    expect(computeBmr(p, 2026)).not.toBe(computeBmr(p, 2036));
  });
});

describe('gymBonus', () => {
  it('naik bertahap sampai 6 sesi lalu mendatar', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(gymBonus)).toEqual([
      0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.12,
    ]);
  });

  it('lebih dari 7 sesi tidak menambah apa pun', () => {
    expect(gymBonus(14)).toBe(gymBonus(7));
  });

  it('nilai negatif atau pecahan diperlakukan aman', () => {
    expect(gymBonus(-3)).toBe(0);
    expect(gymBonus(3.9)).toBe(gymBonus(3));
  });

  it('NaN tidak menghasilkan bonus, bukan NaN', () => {
    // gym_per_week berasal dari input pengguna. NaN menembus penjepitan
    // rentang dan akan merambat sampai ke angka kalori kalau tidak ditahan.
    expect(gymBonus(Number.NaN)).toBe(0);
    expect(gymBonus(Number.POSITIVE_INFINITY)).toBe(gymBonus(7));
  });
});

describe('activityFactor', () => {
  it('menjumlahkan faktor dasar dengan bonus gym', () => {
    expect(activityFactor('sedentary', 3)).toBeCloseTo(1.26, 10);
  });

  it('tidak pernah melewati batas atas', () => {
    expect(activityFactor('very_high', 7)).toBe(ACTIVITY_FACTOR_MAX);
  });
});

describe('computeTdee', () => {
  it('BMR dikali faktor aktivitas gabungan', () => {
    const p = profile({ activity: 'moderate', gymPerWeek: 4 });
    expect(computeTdee(1000, p)).toBe(Math.round(1000 * (1.55 + 0.08)));
  });
});

describe('bmi', () => {
  it('menghitung indeks massa tubuh', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3);
  });

  it('menandai kurang berat badan di bawah 18,5', () => {
    expect(isUnderweight(48, 170)).toBe(true);
    expect(isUnderweight(63, 175)).toBe(false);
  });
});
