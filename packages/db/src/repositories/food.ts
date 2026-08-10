import type { Pool, PoolClient } from 'pg';

import type { FoodItemRow, FoodMatch, FoodPortionRow } from '../types';

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
