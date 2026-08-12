import { describe, expect, it } from 'vitest';

import { localMoment, shiftDate } from './time';

describe('localMoment', () => {
  it('memakai tanggal WIB, bukan tanggal UTC', () => {
    // 2026-08-12T17:30Z = 2026-08-13 00:30 WIB. Menghitung dari UTC akan
    // menaruh makan malam ini ke tanggal kemarin.
    expect(localMoment(new Date('2026-08-12T17:30:00Z'))).toEqual({
      date: '2026-08-13',
      hour: 0,
    });
  });

  it('menyebut tengah malam sebagai jam 0, bukan 24', () => {
    expect(localMoment(new Date('2026-08-12T17:00:00Z')).hour).toBe(0);
  });

  it('membaca jam sore dengan benar', () => {
    // 12:15 UTC = 19:15 WIB.
    expect(localMoment(new Date('2026-08-12T12:15:00Z'))).toEqual({
      date: '2026-08-12',
      hour: 19,
    });
  });

  it('menghormati timezone lain kalau diminta', () => {
    expect(localMoment(new Date('2026-08-12T17:30:00Z'), 'UTC')).toEqual({
      date: '2026-08-12',
      hour: 17,
    });
  });
});

describe('shiftDate', () => {
  it('mundur dan maju tanpa menyentuh timezone lokal', () => {
    expect(shiftDate('2026-08-12', -6)).toBe('2026-08-06');
    expect(shiftDate('2026-08-12', 1)).toBe('2026-08-13');
    expect(shiftDate('2026-08-12', 0)).toBe('2026-08-12');
  });

  it('menyeberangi batas bulan dan tahun', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('tahu 2028 kabisat', () => {
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
  });
});
