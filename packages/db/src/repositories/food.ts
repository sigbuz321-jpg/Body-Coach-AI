import type { Pool, PoolClient } from 'pg';

import type { FoodItemRow, FoodMatch, FoodPortionRow, FoodWithPortion } from '../types';

type Q = Pool | PoolClient;

/**
 * Tahap 1 kaskade resolver: alias eksak (docs/02-technical-spec.md §5).
 * `alias_norm` adalah kolom generated `lower(trim(alias))`, jadi pencocokan
 * di sini murni lookup index, bukan scan.
 */
export async function findByAlias(db: Q, normalizedQuery: string): Promise<FoodItemRow | null> {
  const { rows } = await db.query<FoodItemRow>(
    `SELECT fi.*
       FROM food_aliases fa
       JOIN food_items fi ON fi.id = fa.food_item_id
      WHERE fa.alias_norm = $1
      ORDER BY fa.weight DESC
      LIMIT 1`,
    [normalizedQuery],
  );
  return rows[0] ?? null;
}

/**
 * Tahap 2: trigram. Mencari di nama kanonik maupun alias, lalu mengambil
 * skor terbaik per makanan — "nasi pdang" harus tetap menemukan Nasi Padang
 * lewat aliasnya sekalipun namanya tidak persis.
 */
export async function searchByTrigram(
  db: Q,
  normalizedQuery: string,
  opts: { threshold?: number; limit?: number } = {},
): Promise<FoodMatch[]> {
  const threshold = opts.threshold ?? 0.45;
  const limit = opts.limit ?? 5;

  const { rows } = await db.query<FoodMatch>(
    `WITH scored AS (
       SELECT fi.id, similarity(fi.name_id, $1) AS similarity
         FROM food_items fi
        WHERE fi.name_id % $1
       UNION ALL
       SELECT fa.food_item_id AS id, similarity(fa.alias_norm, $1) * fa.weight AS similarity
         FROM food_aliases fa
        WHERE fa.alias_norm % $1
     ),
     best AS (
       SELECT id, max(similarity) AS similarity
         FROM scored
        GROUP BY id
     )
     SELECT fi.*, b.similarity
       FROM best b
       JOIN food_items fi ON fi.id = b.id
      WHERE b.similarity >= $2
      ORDER BY b.similarity DESC
      LIMIT $3`,
    [normalizedQuery, threshold, limit],
  );
  return rows;
}

export interface MealCandidateRow {
  name_id: string;
  portion_label: string;
  portion_grams: string;
  kcal_per_100g: string;
  protein_per_100g: string;
  carbs_per_100g: string;
  fat_per_100g: string;
}

/**
 * Kandidat makanan untuk `recommend_meal` (§6.2).
 *
 * Ini yang menjaga AD-1 di jalur rekomendasi: model tidak menyebut makanan
 * dari ingatannya lalu mengarang kalorinya, ia memilih dari daftar ini —
 * daftar yang seluruh angkanya berasal dari food database dan sudah dihitung
 * untuk porsi defaultnya.
 *
 * Diurutkan dari protein per porsi tertinggi. Protein adalah makro yang paling
 * sering tertinggal, baik saat bulk maupun cut, jadi mendahulukannya membuat
 * saran pertama hampir selalu saran yang berguna.
 *
 * `excludeTerms` dicocokkan ke nama makanan apa adanya. Batasan yang perlu
 * jujur diakui: skema belum punya penanda halal/pork/seafood (§3), jadi
 * preferensi seperti "no_pork" tidak bisa ditegakkan di sini — hanya disaring
 * lewat kata di namanya. Penandanya harus masuk skema sebelum preferensi
 * makanan boleh diklaim benar-benar dihormati.
 */
export async function findMealCandidates(
  db: Q,
  opts: { maxKcal: number; excludeTerms?: readonly string[]; limit?: number },
): Promise<MealCandidateRow[]> {
  const excludes = (opts.excludeTerms ?? [])
    .filter((t) => t.trim().length > 0)
    .map((t) => `%${t}%`);

  const { rows } = await db.query<MealCandidateRow>(
    `SELECT fi.name_id,
            fp.label AS portion_label,
            fp.grams AS portion_grams,
            fi.kcal_per_100g,
            fi.protein_per_100g,
            fi.carbs_per_100g,
            fi.fat_per_100g
       FROM food_items fi
       JOIN food_portions fp ON fp.food_item_id = fi.id AND fp.is_default
      WHERE fi.kcal_per_100g * fp.grams / 100 <= $1
        AND ($2::text[] = '{}' OR NOT (fi.name_id ILIKE ANY($2::text[])))
      ORDER BY fi.protein_per_100g * fp.grams / 100 DESC
      LIMIT $3`,
    [opts.maxKcal, excludes, opts.limit ?? 8],
  );
  return rows;
}

export async function getPortions(db: Q, foodItemId: string): Promise<FoodPortionRow[]> {
  const { rows } = await db.query<FoodPortionRow>(
    `SELECT * FROM food_portions
      WHERE food_item_id = $1
      ORDER BY is_default DESC, grams ASC`,
    [foodItemId],
  );
  return rows;
}

export async function getDefaultPortion(db: Q, foodItemId: string): Promise<FoodPortionRow | null> {
  const { rows } = await db.query<FoodPortionRow>(
    `SELECT * FROM food_portions
      WHERE food_item_id = $1 AND is_default
      LIMIT 1`,
    [foodItemId],
  );
  return rows[0] ?? null;
}

/**
 * Makanan beserta porsi defaultnya, diambil per `name_id` dan dikembalikan
 * **mengikuti urutan nama yang diminta** (`ORDER BY array_position`).
 *
 * Dipakai landing page: angka kalori di kartu makanan wajib dirender dari
 * database, bukan ditulis di markup. Angka di file desain (`±870 kkal` untuk
 * Nasi Padang) adalah placeholder — kalau dibiarkan, hal pertama yang
 * dilakukan calon pengguna adalah menangkap produk ini salah hitung
 * (CLAUDE.md konflik no. 8).
 *
 * Pencocokan lewat `name_id`, bukan slug: slug hanya ada di CSV seed sebagai
 * kunci relasi antar file, tidak pernah masuk ke skema (§3). `seed.ts` juga
 * mengidentifikasi baris lewat `name_id`, jadi keduanya konsisten.
 *
 * Nama yang tidak ada di database tidak menghasilkan baris. Pemanggil yang
 * butuh jaminan kelengkapan harus memeriksa panjang hasilnya sendiri.
 */
export async function listFoodsWithDefaultPortion(
  db: Q,
  nameIds: readonly string[],
): Promise<FoodWithPortion[]> {
  if (nameIds.length === 0) return [];
  const { rows } = await db.query<FoodWithPortion>(
    `SELECT fi.name_id,
            fi.kcal_per_100g,
            fi.protein_per_100g,
            fi.verified,
            fp.label AS portion_label,
            fp.grams AS portion_grams
       FROM food_items fi
       JOIN food_portions fp ON fp.food_item_id = fi.id AND fp.is_default
      WHERE fi.name_id = ANY($1::text[])
      ORDER BY array_position($1::text[], fi.name_id)`,
    [[...nameIds]],
  );
  return rows;
}
