import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Landing page tidak boleh menampilkan angka gizi yang tidak berasal dari
 * food database (CLAUDE.md konflik no. 8). Tes ini menjaga dua hal:
 *
 * 1. Kalori dihitung dari `kcal_per_100g` x gram porsi default — bukan angka
 *    placeholder dari file desain.
 * 2. Database yang tumbang membuat kartunya hilang, bukan membuat angkanya
 *    dikarang, dan bukan menjatuhkan halaman publik.
 */

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  fail: false,
  requestedNames: [] as string[],
}));

vi.mock('@bodycoach/db', () => ({
  getPool: () => ({}),
  listFoodsWithDefaultPortion: async (_db: unknown, names: readonly string[]) => {
    state.requestedNames = [...names];
    if (state.fail) throw new Error('ECONNREFUSED');
    return state.rows;
  },
}));

const { LANDING_FOOD_NAMES, loadLandingFoods } = await import('./landingFoods');

function row(over: Record<string, unknown> = {}) {
  return {
    name_id: 'Nasi Padang',
    kcal_per_100g: '210.00',
    protein_per_100g: '8.00',
    verified: false,
    portion_label: 'porsi bungkus',
    portion_grams: '350.0',
    ...over,
  };
}

beforeEach(() => {
  state.rows = [];
  state.fail = false;
  state.requestedNames = [];
});

/**
 * Nama yang salah ketik tidak melempar error — query hanya mengembalikan baris
 * lebih sedikit, dan kartunya hilang tanpa suara. "Rendang" (nama sebenarnya
 * "Rendang daging sapi") lolos sampai halamannya dibuka dan kartunya kurang
 * satu. Tes ini mencocokkan daftarnya langsung ke CSV seed, tanpa database.
 */
describe('LANDING_FOOD_NAMES', () => {
  const csv = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data/seeds/food/foods.csv'),
    'utf8',
  );
  const seededNames = new Set(
    csv
      .split('\n')
      .slice(1)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split(',')[1]),
  );

  it('membaca CSV seed (sanity check)', () => {
    expect(seededNames.size).toBeGreaterThan(40);
    expect(seededNames.has('Nasi Padang')).toBe(true);
  });

  it.each(LANDING_FOOD_NAMES)('"%s" ada di data/seeds/food/foods.csv', (name) => {
    expect(seededNames.has(name)).toBe(true);
  });

  it('menampilkan dua belas kartu', () => {
    expect(LANDING_FOOD_NAMES).toHaveLength(12);
  });
});

describe('loadLandingFoods', () => {
  it('menghitung kalori dan protein untuk satu porsi default', async () => {
    state.rows = [row()];
    const { foods } = await loadLandingFoods();

    // 210 kkal/100g x 350g = 735 kkal; 8 g/100g x 350g = 28 g.
    expect(foods[0]?.kcal).toBe(735);
    expect(foods[0]?.proteinG).toBe(28);
    expect(foods[0]?.portionLabel).toBe('porsi bungkus');
  });

  it('tidak memakai angka placeholder dari file desain', async () => {
    state.rows = [row()];
    const { foods } = await loadLandingFoods();
    // File desain menuliskan 870 kkal untuk Nasi Padang.
    expect(foods[0]?.kcal).not.toBe(870);
  });

  it('tidak meminta "Warteg" — itu jenis warung, bukan hidangan', async () => {
    await loadLandingFoods();
    expect(state.requestedNames).not.toContain('Warteg');
  });

  it('memilih hidangan demo dari daftar yang sama', async () => {
    state.rows = [row(), row({ name_id: 'Bakso', kcal_per_100g: '100.00' })];
    const { demo } = await loadLandingFoods();
    expect(demo?.name).toBe('Nasi Padang');
    expect(demo?.kcal).toBe(735);
  });

  it('demo null bila hidangannya tidak ada di database', async () => {
    state.rows = [row({ name_id: 'Bakso' })];
    const { demo } = await loadLandingFoods();
    expect(demo).toBeNull();
  });

  it('database tumbang: degradasi, bukan lempar dan bukan angka karangan', async () => {
    state.fail = true;
    const result = await loadLandingFoods();

    expect(result.degraded).toBe(true);
    expect(result.foods).toEqual([]);
    expect(result.demo).toBeNull();
  });

  it('meneruskan status verified apa adanya', async () => {
    state.rows = [row({ verified: true })];
    const { foods } = await loadLandingFoods();
    expect(foods[0]?.verified).toBe(true);
  });
});
