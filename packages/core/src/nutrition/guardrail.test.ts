import { describe, expect, it } from 'vitest';

import { profile } from './fixtures';
import { evaluateProfile, requiresConservativeMode, validateGoal } from './guardrail';

/** Setiap nilai numerik yang tersembunyi di mana pun dalam hasil block. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
}

describe('validateGoal — block', () => {
  it('memblokir cut pada pengguna yang sudah kurang berat badan', () => {
    // BMI 17,2
    const p = profile({
      sex: 'male',
      heightCm: 175,
      weightKg: 52.7,
      targetWeightKg: 48,
      goal: 'cut',
    });
    const result = validateGoal(p);
    expect(result).toEqual({
      kind: 'block',
      reason: 'cut_underweight',
      alternatives: ['maintain', 'bulk'],
    });
  });

  it('memblokir target yang menghasilkan BMI di bawah 18,5', () => {
    const p = profile({
      sex: 'female',
      heightCm: 170,
      weightKg: 48,
      targetWeightKg: 45,
      goal: 'cut',
    });
    expect(validateGoal(p)).toMatchObject({ kind: 'block' });
  });

  it('memblokir cut yang targetnya justru lebih berat', () => {
    const p = profile({ heightCm: 175, weightKg: 70, targetWeightKg: 75, goal: 'cut' });
    expect(validateGoal(p)).toMatchObject({ kind: 'block', reason: 'goal_mismatch' });
  });

  it('memblokir bulk yang targetnya justru lebih ringan', () => {
    const p = profile({ heightCm: 175, weightKg: 70, targetWeightKg: 65, goal: 'bulk' });
    expect(validateGoal(p)).toMatchObject({ kind: 'block', reason: 'goal_mismatch' });
  });

  it('hasil block tidak memuat angka apa pun', () => {
    const blocked = [
      profile({ heightCm: 175, weightKg: 52.7, targetWeightKg: 48, goal: 'cut' }),
      profile({ sex: 'female', heightCm: 170, weightKg: 48, targetWeightKg: 45, goal: 'cut' }),
      profile({ heightCm: 175, weightKg: 70, targetWeightKg: 75, goal: 'cut' }),
    ];
    for (const p of blocked) {
      const result = validateGoal(p);
      expect(result.kind).toBe('block');
      expect(numbersIn(result)).toEqual([]);
    }
  });
});

describe('validateGoal — warn dan ok', () => {
  it('meloloskan profil wajar tanpa peringatan', () => {
    expect(validateGoal(profile())).toEqual({ kind: 'ok' });
  });

  it('memperingatkan selisih berat yang ekstrem', () => {
    const p = profile({ heightCm: 175, weightKg: 120, targetWeightKg: 65, goal: 'cut' });
    expect(validateGoal(p)).toEqual({ kind: 'warn', reasons: ['extreme_delta'] });
  });

  it('memperingatkan klaim kondisi medis', () => {
    const p = profile({ medicalFlags: ['diabetes'] });
    expect(validateGoal(p)).toEqual({ kind: 'warn', reasons: ['medical_flag'] });
  });

  it('mengumpulkan semua warn, tidak berhenti di yang pertama', () => {
    // §4.3 berhenti di kecocokan pertama, sehingga medical_flag tertutup oleh
    // extreme_delta — padahal medical_flag yang menyalakan mode konservatif.
    const p = profile({
      heightCm: 175,
      weightKg: 120,
      targetWeightKg: 65,
      goal: 'cut',
      medicalFlags: ['hamil'],
    });
    const result = validateGoal(p);
    expect(result).toEqual({ kind: 'warn', reasons: ['extreme_delta', 'medical_flag'] });
    expect(requiresConservativeMode(result)).toBe(true);
  });

  it('warn tanpa flag medis tidak menyalakan mode konservatif', () => {
    const p = profile({ heightCm: 175, weightKg: 120, targetWeightKg: 65, goal: 'cut' });
    expect(requiresConservativeMode(validateGoal(p))).toBe(false);
  });

  it('hasil ok tidak menyalakan mode konservatif', () => {
    expect(requiresConservativeMode({ kind: 'ok' })).toBe(false);
  });
});

describe('evaluateProfile', () => {
  it('profil yang diblokir tidak membawa jalan menuju angka', () => {
    const p = profile({
      sex: 'female',
      heightCm: 170,
      weightKg: 48,
      targetWeightKg: 45,
      goal: 'cut',
    });
    const result = evaluateProfile(p);
    expect(result.kind).toBe('blocked');
    expect(numbersIn(result)).toEqual([]);
  });

  it('profil yang lolos menandai apakah mode konservatif perlu dinyalakan', () => {
    expect(evaluateProfile(profile())).toEqual({
      kind: 'ready',
      guardrail: { kind: 'ok' },
      conservative: false,
    });
    expect(evaluateProfile(profile({ medicalFlags: ['ginjal'] })).kind).toBe('ready');
    expect(evaluateProfile(profile({ medicalFlags: ['ginjal'] }))).toMatchObject({
      conservative: true,
    });
  });
});
