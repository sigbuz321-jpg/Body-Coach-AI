import { describe, expect, it } from 'vitest';

import { profile, TEST_YEAR } from './fixtures';
import { computeTargets } from './targets';
import { estimateTimeline } from './timeline';

describe('estimateTimeline', () => {
  it('mengembalikan rentang, bukan satu angka', () => {
    const p = profile({ weightKg: 63, targetWeightKg: 70, goal: 'bulk' });
    const t = computeTargets(p, TEST_YEAR);
    const range = estimateTimeline(p, t.weeklyKg);

    expect(range).not.toBeNull();
    expect(range!.minWeeks).toBeLessThan(range!.maxWeeks);
  });

  it('null untuk maintain — tidak menuju ke mana-mana', () => {
    const p = profile({ goal: 'maintain', weightKg: 70, targetWeightKg: 70 });
    const t = computeTargets(p, TEST_YEAR);
    expect(estimateTimeline(p, t.weeklyKg)).toBeNull();
  });

  it('null ketika berat sudah sama dengan target', () => {
    const p = profile({ weightKg: 70, targetWeightKg: 70, goal: 'bulk' });
    expect(estimateTimeline(p, 0.22)).toBeNull();
  });

  it('jarak lebih jauh berarti waktu lebih lama', () => {
    const dekat = estimateTimeline(profile({ weightKg: 63, targetWeightKg: 66 }), 0.22);
    const jauh = estimateTimeline(profile({ weightKg: 63, targetWeightKg: 78 }), 0.22);
    expect(jauh!.maxWeeks).toBeGreaterThan(dekat!.maxWeeks);
  });
});
