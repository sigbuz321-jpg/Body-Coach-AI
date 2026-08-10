import { evaluateProfile } from '@bodycoach/core';
import type { Profile } from '@bodycoach/core';
import { describe, expect, it } from 'vitest';

/**
 * Kontrak API /api/onboarding: saat engine mengembalikan `kind: 'block'`,
 * respons hanya berisi `kind` dan `reason` (sesuai route handler).
 * Tidak boleh ada angka kalori, makro, atau informasi apapun yang bisa
 * disalahtafsirkan sebagai target.
 *
 * Aturan CLAUDE.md "Guardrail keselamatan adalah syarat rilis, bukan fitur"
 * — ditegakkan oleh tipe PlanResult.blocked (tidak punya field numerik)
 * dan oleh tes ini sebagai bukti berjalan.
 *
 * Tes ini menyimulasikan apa yang dilakukan route handler: dari hasil
 * evaluateProfile, hanya kind + reason yang diambil untuk body respons.
 */

interface ApiBlockedResponse {
  readonly kind: 'blocked';
  readonly reason: string;
}

function toApiBlocked(p: Profile): ApiBlockedResponse | { kind: 'ready' } {
  const result = evaluateProfile(p);
  if (result.kind !== 'blocked') return { kind: 'ready' };
  return { kind: 'blocked', reason: result.guardrail.reason };
}

describe('kontrak respons guardrail — tanpa angka', () => {
  it('wanita 170cm, 48kg, target 45kg cut -> blocked cut_underweight tanpa numerik', () => {
    const p: Profile = {
      sex: 'female',
      birthYear: 2005,
      heightCm: 170,
      weightKg: 48,
      targetWeightKg: 45,
      goal: 'cut',
      activity: 'light',
      gymPerWeek: 2,
      conservativeMode: false,
      medicalFlags: [],
    };
    const result = toApiBlocked(p);
    expect(result.kind).toBe('blocked');
    if (result.kind !== 'blocked') return;

    const serialized = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
    const allowedKeys = new Set(['kind', 'reason']);
    const actualKeys = new Set(Object.keys(serialized));
    for (const k of actualKeys) {
      expect(allowedKeys.has(k)).toBe(true);
    }

    // Tidak ada nilai numerik yang tersimpan di respons.
    expect(JSON.stringify(serialized)).not.toMatch(/\d/);
  });

  it('pria bulk dengan target lebih rendah dari berat -> blocked goal_mismatch', () => {
    const p: Profile = {
      sex: 'male',
      birthYear: 1995,
      heightCm: 175,
      weightKg: 80,
      targetWeightKg: 70,
      goal: 'bulk',
      activity: 'moderate',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    };
    const result = toApiBlocked(p);
    expect(result.kind).toBe('blocked');
    if (result.kind !== 'blocked') return;
    expect(result.reason).toBe('goal_mismatch');
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });

  it('target BMI di bawah 18.5 -> blocked target_underweight', () => {
    const p: Profile = {
      sex: 'male',
      birthYear: 1995,
      heightCm: 160,
      weightKg: 60,
      targetWeightKg: 45,
      goal: 'cut',
      activity: 'moderate',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    };
    const result = toApiBlocked(p);
    expect(result.kind).toBe('blocked');
    if (result.kind !== 'blocked') return;
    expect(['cut_underweight', 'target_underweight']).toContain(result.reason);
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });
});
