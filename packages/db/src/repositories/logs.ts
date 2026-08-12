import type { Pool, PoolClient } from 'pg';

import type { DailyTotalsRow, FoodLogItemInput, FoodLogRow, MessageInput } from '../types';

type Q = Pool | PoolClient;

/**
 * Pencatatan makanan, pesan, dan berat.
 *
 * `source_message_id` adalah lapis **kedua** idempotency (AD-2). Lapis pertama
 * `SET NX` di Redis bisa kehilangan kunci — kunci kedaluwarsa, instance
 * di-restart, kuota penuh. Unique constraint tidak bisa. Karena itu penyisipan
 * di sini memakai `ON CONFLICT DO NOTHING` dan pemanggil wajib memeriksa
 * hasilnya, bukan mengasumsikan barisnya selalu dibuat.
 */

export interface CreateFoodLogInput {
  readonly userId: string;
  readonly localDate: string;
  readonly mealSlot: string | null;
  readonly source: 'wa_text' | 'wa_photo' | 'web' | 'recommendation';
  readonly sourceMessageId: string | null;
  readonly status?: 'pending' | 'confirmed' | 'discarded';
}

/**
 * Membuat food_log. `null` bila `source_message_id` sudah pernah dipakai —
 * artinya pesan yang sama sudah diproses dan pemanggil harus berhenti, bukan
 * mencatat ulang.
 */
export async function createFoodLog(db: Q, input: CreateFoodLogInput): Promise<FoodLogRow | null> {
  const { rows } = await db.query<FoodLogRow>(
    `INSERT INTO food_logs (user_id, local_date, meal_slot, source, source_message_id, status)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'confirmed'))
     ON CONFLICT (source_message_id) DO NOTHING
     RETURNING *`,
    [
      input.userId,
      input.localDate,
      input.mealSlot,
      input.source,
      input.sourceMessageId,
      input.status ?? null,
    ],
  );
  return rows[0] ?? null;
}

export async function addFoodLogItems(
  db: Q,
  foodLogId: string,
  items: readonly FoodLogItemInput[],
): Promise<void> {
  if (items.length === 0) return;
  for (const it of items) {
    await db.query(
      `INSERT INTO food_log_items (
         food_log_id, food_item_id, raw_label, grams, portion_basis,
         match_stage, confidence, kcal, protein_g, carbs_g, fat_g
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        foodLogId,
        it.foodItemId,
        it.rawLabel,
        it.grams,
        it.portionBasis,
        it.matchStage,
        it.confidence,
        it.kcal,
        it.proteinG,
        it.carbsG,
        it.fatG,
      ],
    );
  }
}

/**
 * Total konsumsi satu hari, dihitung langsung dari `food_log_items`.
 *
 * Sengaja tidak membaca `daily_summaries`: tabel itu cache yang bisa basi, dan
 * angka yang dikirim ke pengguna tidak boleh bergantung pada cache yang belum
 * tentu sudah dibangun ulang. `daily_summaries` dipakai dashboard, bukan coach.
 */
export async function getDailyTotals(
  db: Q,
  userId: string,
  localDate: string,
): Promise<DailyTotalsRow> {
  const { rows } = await db.query<DailyTotalsRow>(
    `SELECT COALESCE(SUM(i.kcal), 0)      AS kcal,
            COALESCE(SUM(i.protein_g), 0) AS protein_g,
            COALESCE(SUM(i.carbs_g), 0)   AS carbs_g,
            COALESCE(SUM(i.fat_g), 0)     AS fat_g,
            COUNT(DISTINCT l.id)::int     AS log_count
       FROM food_logs l
       JOIN food_log_items i ON i.food_log_id = l.id
      WHERE l.user_id = $1 AND l.local_date = $2 AND l.status = 'confirmed'`,
    [userId, localDate],
  );
  return rows[0] ?? { kcal: '0', protein_g: '0', carbs_g: '0', fat_g: '0', log_count: 0 };
}

/** Jumlah hari tercatat dalam N hari terakhir — bahan angka adherence. */
export async function countLoggedDays(db: Q, userId: string, sinceDate: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(DISTINCT local_date)::int AS n
       FROM food_logs
      WHERE user_id = $1 AND local_date >= $2 AND status = 'confirmed'`,
    [userId, sinceDate],
  );
  return rows[0]?.n ?? 0;
}

/** Jumlah food_log hari ini — dipakai penegakan limit Free (§9). */
export async function countLogsOnDate(db: Q, userId: string, localDate: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM food_logs
      WHERE user_id = $1 AND local_date = $2 AND status <> 'discarded'`,
    [userId, localDate],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Mencatat pesan masuk/keluar.
 *
 * `wa_message_id` unik, jadi pesan yang sama tidak tercatat dua kali kalau
 * worker mengulang. Isi pesan disimpan di sini karena coach butuh riwayat —
 * tapi tidak pernah ikut ke error tracker (konvensi CLAUDE.md).
 */
export async function recordMessage(db: Q, input: MessageInput): Promise<void> {
  await db.query(
    `INSERT INTO messages (user_id, wa_message_id, direction, kind, body, meta)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [
      input.userId,
      input.waMessageId,
      input.direction,
      input.kind,
      input.body ?? null,
      input.meta ? JSON.stringify(input.meta) : null,
    ],
  );
}

/**
 * Menyimpan berat badan. Satu entri per hari — kiriman kedua di hari yang sama
 * menimpa yang pertama, karena itu koreksi, bukan pengukuran baru.
 */
export async function upsertWeight(
  db: Q,
  userId: string,
  localDate: string,
  weightKg: number,
): Promise<void> {
  await db.query(
    `INSERT INTO weight_entries (user_id, local_date, weight_kg, source)
     VALUES ($1, $2, $3, 'whatsapp')
     ON CONFLICT (user_id, local_date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg`,
    [userId, localDate, weightKg],
  );
}

export interface WeightPoint {
  readonly local_date: string;
  readonly weight_kg: string;
}

/** Entri berat sejak tanggal tertentu, urut lama ke baru. */
export async function listWeights(
  db: Q,
  userId: string,
  sinceDate: string,
): Promise<WeightPoint[]> {
  const { rows } = await db.query<WeightPoint>(
    `SELECT local_date, weight_kg
       FROM weight_entries
      WHERE user_id = $1 AND local_date >= $2
      ORDER BY local_date ASC`,
    [userId, sinceDate],
  );
  return rows;
}
