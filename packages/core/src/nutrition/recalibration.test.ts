import { describe, expect, it } from 'vitest';

import { profile, TEST_YEAR } from './fixtures';
import { ema, evaluateRecalibration, weeklyRate, type WeekObservation } from './recalibration';
import { computeTargets } from './targets';
import type { TargetSet } from './types';

const week = (weights: number[], adherence = 1): WeekObservation => ({ weights, adherence });

/** Deret berat konstan pada nilai tertentu — EMA-nya sama dengan nilai itu. */
const flat = (kg: number, adherence = 1) => week([kg, kg, kg, kg, kg, kg, kg], adherence);

describe('ema', () => {
  it('null untuk deret kosong', () => {
    expect(ema([])).toBeNull();
  });

  it('satu nilai mengembalikan nilai itu', () => {
    expect(ema([63.4])).toBe(63.4);
  });

  it('memberi bobot lebih pada pengamatan terbaru', () => {
    const naik = ema([62, 62, 62, 64]);
    expect(naik).toBeGreaterThan(62);
    expect(naik).toBeLessThan(64);
  });

  it('meredam lonjakan harian', () => {
    // Satu hari berat melonjak 2 kg karena air; tren tidak boleh ikut melompat.
    const dengan = ema([63, 63, 63, 65, 63]) as number;
    expect(Math.abs(dengan - 63)).toBeLessThan(0.5);
  });
});

describe('weeklyRate', () => {
  it('null kalau salah satu jendela kosong', () => {
    expect(weeklyRate(week([]), flat(63))).toBeNull();
    expect(weeklyRate(flat(63), week([]))).toBeNull();
  });

  it('null kalau jendela sebelumnya nol', () => {
    expect(weeklyRate(flat(0), flat(63))).toBeNull();
  });

  it('positif ketika berat naik', () => {
    expect(weeklyRate(flat(63), flat(63.5))).toBeGreaterThan(0);
  });
});

describe('evaluateRecalibration', () => {
  const p = profile({ goal: 'bulk', weightKg: 63, targetWeightKg: 70 });
  const target = computeTargets(p, TEST_YEAR);

  it('menahan diri kalau jendela pengamatan kurang dari tiga', () => {
    expect(evaluateRecalibration(p, target, [flat(63), flat(63)])).toEqual({
      kind: 'hold',
      reason: 'insufficient_data',
    });
  });

  it('menahan diri kalau ada jendela tanpa data berat', () => {
    expect(evaluateRecalibration(p, target, [flat(63), week([]), flat(63)])).toEqual({
      kind: 'hold',
      reason: 'insufficient_data',
    });
  });

  it('menahan diri kalau pencatatan pengguna di bawah 0,7', () => {
    // Tanpa guard ini, sistem menaikkan kalori orang yang sebenarnya cuma lupa mencatat.
    const decision = evaluateRecalibration(p, target, [flat(63), flat(63, 0.5), flat(63)]);
    expect(decision).toEqual({ kind: 'hold', reason: 'low_adherence' });
  });

  it('menahan diri kalau laju sudah sesuai target', () => {
    // bulk 0,35%/minggu pada 63 kg
    const w1 = flat(63);
    const w2 = flat(63 * 1.0035);
    const w3 = flat(63 * 1.0035 * 1.0035);
    expect(evaluateRecalibration(p, target, [w1, w2, w3])).toEqual({
      kind: 'hold',
      reason: 'on_track',
    });
  });

  it('menahan diri kalau penyimpangan hanya satu minggu', () => {
    const w1 = flat(63);
    const w2 = flat(63); // meleset ke bawah
    const w3 = flat(63 * 1.01); // lalu meleset ke atas
    expect(evaluateRecalibration(p, target, [w1, w2, w3])).toEqual({
      kind: 'hold',
      reason: 'not_persistent',
    });
  });

  it('menaikkan kalori kalau berat tidak naik dua minggu berturut-turut', () => {
    const decision = evaluateRecalibration(p, target, [flat(63), flat(63), flat(63)]);
    expect(decision.kind).toBe('adjust');
    if (decision.kind !== 'adjust') return;
    expect(decision.deltaKcal).toBe(100);
    expect(decision.newKcal).toBe(target.kcal + 100);
    expect(decision.actualRate).toBe(0);
  });

  it('memakai langkah lebih besar kalau penyimpangannya jauh', () => {
    const w1 = flat(63);
    const w2 = flat(63 * 0.998);
    const w3 = flat(63 * 0.998 * 0.998);
    const decision = evaluateRecalibration(p, target, [w1, w2, w3]);
    expect(decision.kind).toBe('adjust');
    if (decision.kind !== 'adjust') return;
    expect(decision.deltaKcal).toBe(150);
  });

  it('menurunkan kalori kalau berat naik terlalu cepat', () => {
    const w1 = flat(63);
    const w2 = flat(63 * 1.012);
    const w3 = flat(63 * 1.012 * 1.012);
    const decision = evaluateRecalibration(p, target, [w1, w2, w3]);
    expect(decision.kind).toBe('adjust');
    if (decision.kind !== 'adjust') return;
    expect(decision.deltaKcal).toBeLessThan(0);
  });

  it('tidak pernah menembus safety rail — penurunan yang tertahan menjadi hold', () => {
    const kecil = profile({
      sex: 'female',
      goal: 'cut',
      heightCm: 155,
      weightKg: 50,
      targetWeightKg: 47,
      activity: 'sedentary',
      gymPerWeek: 0,
      birthYear: TEST_YEAR - 30,
    });
    const atFloor: TargetSet = { ...computeTargets(kecil, TEST_YEAR), bmr: 1100, kcal: 1200 };

    // Berat tidak turun sama sekali, jadi mesin ingin memangkas kalori.
    const decision = evaluateRecalibration(kecil, atFloor, [flat(50), flat(50), flat(50)]);
    expect(decision).toEqual({ kind: 'hold', reason: 'on_track' });
  });

  it('mode konservatif menahan penurunan di 85% TDEE', () => {
    const hati = profile({
      goal: 'cut',
      weightKg: 90,
      targetWeightKg: 80,
      conservativeMode: true,
      birthYear: TEST_YEAR - 35,
    });
    const t: TargetSet = { ...computeTargets(hati, TEST_YEAR), bmr: 1500, tdee: 2600, kcal: 2210 };

    const decision = evaluateRecalibration(hati, t, [flat(90), flat(90), flat(90)]);
    // Usulan 2210 − 150 = 2060 tertahan di round(2600 × 0,85) = 2210, jadi tidak berubah.
    expect(decision).toEqual({ kind: 'hold', reason: 'on_track' });
  });

  it('maintain memakai laju harapan nol', () => {
    const stabil = profile({ goal: 'maintain', weightKg: 70, targetWeightKg: 70 });
    const t = computeTargets(stabil, TEST_YEAR);
    const w1 = flat(70);
    const w2 = flat(70 * 1.006);
    const w3 = flat(70 * 1.006 * 1.006);
    const decision = evaluateRecalibration(stabil, t, [w1, w2, w3]);
    expect(decision.kind).toBe('adjust');
    if (decision.kind !== 'adjust') return;
    expect(decision.expectedRate).toBe(0);
    expect(decision.deltaKcal).toBeLessThan(0);
  });
});
