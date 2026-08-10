import { describe, expect, it } from 'vitest';

import {
  formatDecimal2,
  formatEstimate,
  formatInt,
  formatKg,
  formatWeight,
  formatWeekRange,
  formatWeeklyRate,
} from './format';

describe('format angka id-ID', () => {
  it('formatInt memakai pemisah ribuan dengan titik', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(1234)).toBe('1.234');
    expect(formatInt(1_830_000)).toBe('1.830.000');
  });

  it('formatKg menampilkan satu desimal dengan koma', () => {
    expect(formatKg(70)).toBe('70,0');
    expect(formatKg(63.4)).toBe('63,4');
    expect(formatKg(1234.5)).toBe('1.234,5');
  });

  it('formatDecimal2 menampilkan dua desimal', () => {
    expect(formatDecimal2(0.22)).toBe('0,22');
    expect(formatDecimal2(3.456)).toBe('3,46');
  });

  it('formatEstimate memulai dengan ± dan menyertakan satuan', () => {
    expect(formatEstimate(720, 'kkal')).toBe('±720 kkal');
    expect(formatEstimate(1830, 'kkal')).toBe('±1.830 kkal');
  });

  it('formatWeekRange menampilkan rentang atau tunggal', () => {
    expect(formatWeekRange(27, 43)).toBe('27–43 minggu');
    expect(formatWeekRange(8, 8)).toBe('8 minggu');
  });

  it('formatWeeklyRate memilih tanda yang tepat', () => {
    expect(formatWeeklyRate(0.22)).toBe('+0,22 kg/minggu');
    expect(formatWeeklyRate(-0.45)).toBe('−0,45 kg/minggu');
    expect(formatWeeklyRate(0)).toBe('0,00 kg/minggu');
  });

  it('formatWeight menambahkan "kg"', () => {
    expect(formatWeight(63.4)).toBe('63,4 kg');
    expect(formatWeight(70)).toBe('70,0 kg');
  });
});
