import { getPool, listFoodsWithDefaultPortion } from '@bodycoach/db';

/**
 * Data makanan untuk landing page — diambil dari Indonesian Food Database,
 * tidak pernah ditulis di markup.
 *
 * Alasannya ada di CLAUDE.md konflik no. 8: angka di file desain (Nasi Padang
 * ±870, Ayam Geprek ±430, dst) adalah placeholder. Kalau dibiarkan, hal
 * pertama yang dilakukan calon pengguna yang tahu makanan Indonesia adalah
 * menangkap produk ini salah hitung — di halaman yang tugasnya membangun
 * kepercayaan.
 *
 * [DEVIASI] Kartu "Warteg" di file desain diganti "Rendang". "Warteg" adalah
 * jenis warung, bukan hidangan, jadi tidak ada barisnya di food database dan
 * tidak punya angka yang bisa dipertanggungjawabkan. Kalimat pengantar section
 * tetap menyebut warteg.
 */

/**
 * `name_id` persis seperti di `data/seeds/food/foods.csv`, sesuai urutan tampil.
 *
 * Diekspor supaya `landingFoods.test.ts` bisa mencocokkannya dengan CSV seed:
 * nama yang salah ketik tidak melempar error, ia hanya menghilangkan satu
 * kartu tanpa suara. "Rendang" (bukan "Rendang daging sapi") sempat lolos
 * sampai halamannya dibuka dan kartunya kurang satu.
 */
export const LANDING_FOOD_NAMES = [
  'Nasi Padang',
  'Ayam geprek',
  'Rendang daging sapi',
  'Mie ayam',
  'Bakso',
  'Nasi goreng',
  'Mie instan goreng',
  'Soto ayam',
  'Gado-gado',
  'Martabak manis',
  'Es kopi susu',
  'Sate ayam',
] as const;

/** Hidangan yang dipakai di percakapan contoh. Angkanya juga dari database. */
const DEMO_FOOD_NAME = 'Nasi Padang';

export interface LandingFood {
  readonly name: string;
  readonly kcal: number;
  readonly proteinG: number;
  readonly portionLabel: string;
  readonly verified: boolean;
}

export interface LandingFoodData {
  readonly foods: readonly LandingFood[];
  readonly demo: LandingFood | null;
  /** True bila database tidak terjangkau — section makanan dirender kosong. */
  readonly degraded: boolean;
}

function perPortion(per100g: string, grams: string): number {
  return Math.round((Number(per100g) * Number(grams)) / 100);
}

export async function loadLandingFoods(): Promise<LandingFoodData> {
  try {
    const rows = await listFoodsWithDefaultPortion(getPool(), LANDING_FOOD_NAMES);
    if (rows.length !== LANDING_FOOD_NAMES.length) {
      // Nama yang tidak cocok tidak melempar error — ia hanya menghilangkan
      // kartunya. Dicatat supaya ketahuan tanpa harus menghitung kartu di layar.
      const found = new Set(rows.map((r) => r.name_id));
      const missing = LANDING_FOOD_NAMES.filter((n) => !found.has(n));
      console.warn('[landing] makanan tidak ditemukan di database:', missing.join(', '));
    }
    const foods = rows.map((r): LandingFood => ({
      name: r.name_id,
      kcal: perPortion(r.kcal_per_100g, r.portion_grams),
      proteinG: perPortion(r.protein_per_100g, r.portion_grams),
      portionLabel: r.portion_label,
      verified: r.verified,
    }));
    return {
      foods,
      demo: foods.find((f) => f.name === DEMO_FOOD_NAME) ?? null,
      degraded: false,
    };
  } catch (err) {
    // Landing adalah halaman publik: database yang sedang tumbang tidak boleh
    // menjatuhkannya. Yang hilang hanya kartu makanannya — angka tidak pernah
    // dikarang sebagai pengganti.
    console.error('[landing] gagal memuat food database:', err);
    return { foods: [], demo: null, degraded: true };
  }
}
