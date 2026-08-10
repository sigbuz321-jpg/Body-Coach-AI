import { describe, expect, it } from 'vitest';

import { TEST_YEAR } from './fixtures';
import { validateGoal } from './guardrail';
import { computeTargets } from './targets';
import { estimateTimeline } from './timeline';
import type { Profile } from './types';

/**
 * Dua puluh profil referensi. Snapshot-nya adalah kontrak: setiap perubahan di
 * modul nutrition yang menggeser angka mana pun di sini akan memerahkan test,
 * dan harus disertai kenaikan ENGINE_VERSION supaya target lama tetap bisa
 * dijelaskan asal-usulnya.
 *
 * Lima profil pertama adalah daftar verifikasi manual pemilik produk di PLAN.md M2.
 */
const REFERENCE: ReadonlyArray<{ label: string; profile: Profile }> = [
  {
    label: 'PLAN-1 · pria 22th 175cm 63kg bulk→70kg gym 4x',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 22,
      heightCm: 175,
      weightKg: 63,
      targetWeightKg: 70,
      goal: 'bulk',
      activity: 'moderate',
      gymPerWeek: 4,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'PLAN-2 · pria 28th 178cm 85kg cut→75kg gym 3x',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 28,
      heightCm: 178,
      weightKg: 85,
      targetWeightKg: 75,
      goal: 'cut',
      activity: 'moderate',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'PLAN-3 · wanita 25th 160cm 60kg cut→55kg gym 3x',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 25,
      heightCm: 160,
      weightKg: 60,
      targetWeightKg: 55,
      goal: 'cut',
      activity: 'light',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'PLAN-4 · wanita 20th 170cm 48kg cut→45kg (harus diblokir)',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 20,
      heightCm: 170,
      weightKg: 48,
      targetWeightKg: 45,
      goal: 'cut',
      activity: 'light',
      gymPerWeek: 2,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'PLAN-5 · pria 30th 172cm 70kg maintain',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 30,
      heightCm: 172,
      weightKg: 70,
      targetWeightKg: 70,
      goal: 'maintain',
      activity: 'moderate',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 19th 168cm 55kg bulk→62kg sedentary',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 19,
      heightCm: 168,
      weightKg: 55,
      targetWeightKg: 62,
      goal: 'bulk',
      activity: 'sedentary',
      gymPerWeek: 2,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 35th 180cm 100kg cut→85kg gym 5x',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 35,
      heightCm: 180,
      weightKg: 100,
      targetWeightKg: 85,
      goal: 'cut',
      activity: 'high',
      gymPerWeek: 5,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 30th 155cm 70kg cut→58kg gym 4x',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 30,
      heightCm: 155,
      weightKg: 70,
      targetWeightKg: 58,
      goal: 'cut',
      activity: 'moderate',
      gymPerWeek: 4,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 24th 165cm 50kg bulk→56kg gym 3x',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 24,
      heightCm: 165,
      weightKg: 50,
      targetWeightKg: 56,
      goal: 'bulk',
      activity: 'light',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 45th 170cm 80kg maintain sedentary',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 45,
      heightCm: 170,
      weightKg: 80,
      targetWeightKg: 80,
      goal: 'maintain',
      activity: 'sedentary',
      gymPerWeek: 0,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 26th 185cm 75kg bulk→88kg gym 6x',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 26,
      heightCm: 185,
      weightKg: 75,
      targetWeightKg: 88,
      goal: 'bulk',
      activity: 'high',
      gymPerWeek: 6,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 40th 158cm 65kg cut→58kg konservatif',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 40,
      heightCm: 158,
      weightKg: 65,
      targetWeightKg: 58,
      goal: 'cut',
      activity: 'light',
      gymPerWeek: 2,
      conservativeMode: true,
      medicalFlags: ['diabetes'],
    },
  },
  {
    label: 'pria 21th 173cm 58kg bulk→70kg (selisih ekstrem)',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 21,
      heightCm: 173,
      weightKg: 58,
      targetWeightKg: 70,
      goal: 'bulk',
      activity: 'moderate',
      gymPerWeek: 5,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 22th 168cm 90kg cut→60kg gym 3x',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 22,
      heightCm: 168,
      weightKg: 90,
      targetWeightKg: 60,
      goal: 'cut',
      activity: 'moderate',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 55th 165cm 68kg maintain light',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 55,
      heightCm: 165,
      weightKg: 68,
      targetWeightKg: 68,
      goal: 'maintain',
      activity: 'light',
      gymPerWeek: 1,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 19th 152cm 45kg bulk→52kg',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 19,
      heightCm: 152,
      weightKg: 45,
      targetWeightKg: 52,
      goal: 'bulk',
      activity: 'light',
      gymPerWeek: 3,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 33th 176cm 120kg cut→95kg sedentary',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 33,
      heightCm: 176,
      weightKg: 120,
      targetWeightKg: 95,
      goal: 'cut',
      activity: 'sedentary',
      gymPerWeek: 0,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'pria 27th 170cm 65kg bulk→72kg very_high gym 7x',
    profile: {
      sex: 'male',
      birthYear: TEST_YEAR - 27,
      heightCm: 170,
      weightKg: 65,
      targetWeightKg: 72,
      goal: 'bulk',
      activity: 'very_high',
      gymPerWeek: 7,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 29th 172cm 62kg maintain moderate',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 29,
      heightCm: 172,
      weightKg: 62,
      targetWeightKg: 62,
      goal: 'maintain',
      activity: 'moderate',
      gymPerWeek: 4,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
  {
    label: 'wanita 65th 120cm 100kg cut→90kg (kasus batas paling ekstrem)',
    profile: {
      sex: 'female',
      birthYear: TEST_YEAR - 65,
      heightCm: 120,
      weightKg: 100,
      targetWeightKg: 90,
      goal: 'cut',
      activity: 'sedentary',
      gymPerWeek: 0,
      conservativeMode: false,
      medicalFlags: [],
    },
  },
];

describe('profil referensi', () => {
  it('menghasilkan tepat 20 profil', () => {
    expect(REFERENCE).toHaveLength(20);
  });

  it('stabil lintas rilis', async () => {
    const output = REFERENCE.map(({ label, profile: p }) => {
      const guardrail = validateGoal(p);
      if (guardrail.kind === 'block') {
        // Profil yang diblokir tidak punya angka — itulah inti aturannya.
        return { label, guardrail };
      }
      const targets = computeTargets(p, TEST_YEAR);
      return {
        label,
        guardrail,
        targets,
        timeline: estimateTimeline(p, targets.weeklyKg),
      };
    });

    await expect(JSON.stringify(output, null, 2) + '\n').toMatchFileSnapshot(
      './__snapshots__/reference-profiles.json',
    );
  });
});
