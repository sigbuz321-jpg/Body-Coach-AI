import type { Pool, PoolClient } from 'pg';

import type { TargetVersionInput, TargetVersionRow } from '../types';

type Q = Pool | PoolClient;

/**
 * Menambahkan versi target baru. APPEND-ONLY (AD-4) — tidak ada fungsi update
 * di modul ini, dan itu disengaja. Rekalibrasi membuat baris baru dengan
 * `effective_from` berbeda; riwayat target lama tidak pernah hilang.
 *
 * Constraint UNIQUE(user_id, effective_from) mencegah dua target berlaku di
 * hari yang sama.
 */
export async function appendTargetVersion(db: Q, t: TargetVersionInput): Promise<TargetVersionRow> {
  const { rows } = await db.query<TargetVersionRow>(
    `INSERT INTO target_versions (
       user_id, effective_from, goal, bmr, tdee, kcal,
       protein_g, carbs_g, fat_g, weekly_rate_kg, reason, engine_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      t.userId,
      t.effectiveFrom,
      t.goal,
      t.bmr,
      t.tdee,
      t.kcal,
      t.proteinG,
      t.carbsG,
      t.fatG,
      t.weeklyRateKg,
      t.reason,
      t.engineVersion,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('appendTargetVersion tidak mengembalikan baris');
  return row;
}

/**
 * Target yang berlaku bagi user pada tanggal tertentu.
 * Pola query dari docs/01-system-design.md §5.
 */
export async function getTargetOn(
  db: Q,
  userId: string,
  onDate: string,
): Promise<TargetVersionRow | null> {
  const { rows } = await db.query<TargetVersionRow>(
    `SELECT * FROM target_versions
      WHERE user_id = $1 AND effective_from <= $2
      ORDER BY effective_from DESC
      LIMIT 1`,
    [userId, onDate],
  );
  return rows[0] ?? null;
}

export async function listTargetHistory(db: Q, userId: string): Promise<TargetVersionRow[]> {
  const { rows } = await db.query<TargetVersionRow>(
    'SELECT * FROM target_versions WHERE user_id = $1 ORDER BY effective_from DESC',
    [userId],
  );
  return rows;
}
