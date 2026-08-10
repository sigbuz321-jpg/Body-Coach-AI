import { TIMELINE_SPREAD } from './constants';
import type { Profile, TimelineRange } from './types';

/**
 * Perkiraan lama waktu mencapai target berat (§4.2).
 *
 * [DEVIASI] §4.2 membagi dengan `Math.abs(weeklyKg)` tanpa menjaga pembagian
 * nol. Untuk goal maintain laju selalu 0, sehingga rumus aslinya menghasilkan
 * Infinity lalu `Math.round(Infinity)` — angka itu akan sampai ke layar
 * pengguna. Di sini maintain (dan laju nol apa pun) mengembalikan `null`,
 * yang memaksa pemanggil menangani kasus "tidak menuju ke mana-mana".
 */
export function estimateTimeline(p: Profile, weeklyKg: number): TimelineRange | null {
  if (weeklyKg === 0) return null;

  const delta = Math.abs(p.targetWeightKg - p.weightKg);
  if (delta === 0) return null;

  const weeks = delta / Math.abs(weeklyKg);
  return {
    minWeeks: Math.round(weeks * TIMELINE_SPREAD.min),
    maxWeeks: Math.round(weeks * TIMELINE_SPREAD.max),
  };
}
