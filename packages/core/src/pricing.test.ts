import { describe, expect, it } from 'vitest';

import { PRICING, yearlyPerMonthIdr, yearlySavingsPercent } from './pricing';

describe('PRICING', () => {
  it('memakai angka PRD, bukan sisa eksplorasi desain', () => {
    expect(PRICING.monthlyIdr).toBe(39_000);
    expect(PRICING.yearlyIdr).toBe(299_000);
    expect(PRICING.freeIdr).toBe(0);
  });
});

describe('yearlySavingsPercent', () => {
  it('cocok dengan angka "Hemat 36%" di file desain', () => {
    // 39.000 x 12 = 468.000; (468.000 - 299.000) / 468.000 = 36,1%
    expect(yearlySavingsPercent()).toBe(36);
  });

  it('dihitung, bukan konstanta — ikut berubah bila harga berubah', () => {
    const twelve = PRICING.monthlyIdr * 12;
    expect(yearlySavingsPercent()).toBe(Math.round(((twelve - PRICING.yearlyIdr) / twelve) * 100));
  });
});

describe('yearlyPerMonthIdr', () => {
  it('membagi harga tahunan ke dua belas bulan', () => {
    expect(yearlyPerMonthIdr()).toBe(Math.round(299_000 / 12));
    expect(yearlyPerMonthIdr()).toBeLessThan(PRICING.monthlyIdr);
  });
});
