import { nutritionForGrams } from '@bodycoach/core';
import type { Pool, PoolClient } from 'pg';

type Q = Pool | PoolClient;

/**
 * Koreksi pengguna atas item yang salah dikenali (docs §5, DoD M6).
 *
 * Dua alasan tabel ini ada, dan yang kedua lebih penting daripada yang pertama:
 *
 * 1. Memperbaiki angka hari itu untuk pengguna yang mengoreksi.
 * 2. Memberi tahu kita **makanan mana yang paling sering salah**. Food database
 *    ini akan salah — 50 baris pertamanya bahkan belum dicocokkan ke TKPI.
 *    Koreksi adalah satu-satunya sinyal dari pengguna nyata tentang di mana ia
 *    salah, dan membuangnya berarti membuang satu-satunya cara memperbaikinya
 *    secara terarah.
 *
 * `before`/`after` disimpan utuh sebagai jsonb, bukan sebagai kolom terpisah:
 * bentuk item bisa berubah antar versi, dan riwayat koreksi harus tetap bisa
 * dibaca apa adanya bertahun-tahun kemudian.
 */

export type CorrectionType = 'wrong_food' | 'wrong_portion' | 'not_food' | 'missing_item';

export interface FoodLogItemRow {
  id: string;
  food_log_id: string;
  /** Status log induknya — ikut dibaca supaya pemanggil tidak perlu query lagi. */
  log_status?: string;
  food_item_id: string | null;
  raw_label: string;
  grams: string;
  portion_basis: string;
  match_stage: string;
  confidence: string;
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
}

/**
 * Item beserta pemiliknya. `user_id` ikut jadi syarat, bukan hanya `id`:
 * id item dibawa di dalam id tombol WhatsApp, dan tombol adalah masukan dari
 * luar. Tanpa syarat ini, siapa pun yang bisa menebak sebuah uuid bisa
 * mengubah catatan makan orang lain.
 */
export async function findOwnedLogItem(
  db: Q,
  itemId: string,
  userId: string,
): Promise<FoodLogItemRow | null> {
  const { rows } = await db.query<FoodLogItemRow>(
    `SELECT i.*, l.status AS log_status
       FROM food_log_items i
       JOIN food_logs l ON l.id = i.food_log_id
      WHERE i.id = $1 AND l.user_id = $2 AND l.status <> 'discarded'`,
    [itemId, userId],
  );
  return rows[0] ?? null;
}

export interface CorrectionResult {
  readonly before: FoodLogItemRow;
  readonly after: FoodLogItemRow;
}

interface ApplyInput {
  readonly itemId: string;
  readonly userId: string;
  readonly type: CorrectionType;
  /** Makanan pengganti. Kosong berarti hanya porsinya yang berubah. */
  readonly foodItemId?: string;
  /**
   * Pengali terhadap porsi **default** makanannya, bukan terhadap gram yang
   * tersimpan. Tombolnya berbunyi "Setengah porsi", dan porsi yang dimaksud
   * pengguna adalah porsi normal makanan itu — bukan setengah dari tebakan
   * kita sebelumnya, yang justru sedang dikoreksi.
   */
  readonly portionMultiplier?: number;
}

/**
 * Menerapkan koreksi dan mencatatnya, dalam satu transaksi.
 *
 * Angka gizinya **dihitung ulang dari food database**, tidak pernah diterima
 * dari pemanggil (AD-1). Yang boleh ditentukan pengguna hanya *makanan apa*
 * dan *berapa banyak*; berapa kalorinya tetap urusan database dan engine.
 */
export async function applyCorrection(
  client: PoolClient,
  input: ApplyInput,
): Promise<CorrectionResult | null> {
  const before = await findOwnedLogItem(client, input.itemId, input.userId);
  if (!before) return null;

  const foodItemId = input.foodItemId ?? before.food_item_id;
  if (!foodItemId) return null;

  const { rows: makanan } = await client.query<{
    name_id: string;
    kcal_per_100g: string;
    protein_per_100g: string;
    carbs_per_100g: string;
    fat_per_100g: string;
    default_grams: string | null;
  }>(
    `SELECT fi.name_id, fi.kcal_per_100g, fi.protein_per_100g, fi.carbs_per_100g,
            fi.fat_per_100g, fp.grams AS default_grams
       FROM food_items fi
       LEFT JOIN food_portions fp ON fp.food_item_id = fi.id AND fp.is_default
      WHERE fi.id = $1`,
    [foodItemId],
  );
  const m = makanan[0];
  if (!m) return null;

  const porsiDefault = Number(m.default_grams ?? 100);
  const grams =
    input.portionMultiplier !== undefined
      ? porsiDefault * input.portionMultiplier
      : // Makanan diganti tanpa menyebut porsi: pakai porsi default makanan
        // BARUNYA, bukan gram lama — gram lama mengacu ke makanan berbeda.
        input.foodItemId
        ? porsiDefault
        : Number(before.grams);

  const gizi = nutritionForGrams(
    {
      kcal: Number(m.kcal_per_100g),
      proteinG: Number(m.protein_per_100g),
      carbsG: Number(m.carbs_per_100g),
      fatG: Number(m.fat_per_100g),
    },
    grams,
  );

  const { rows: updated } = await client.query<FoodLogItemRow>(
    `UPDATE food_log_items
        SET food_item_id = $2,
            grams = $3,
            portion_basis = 'user_stated',
            match_stage = 'user',
            confidence = 1.0,
            kcal = $4, protein_g = $5, carbs_g = $6, fat_g = $7
      WHERE id = $1
      RETURNING *`,
    [input.itemId, foodItemId, grams, gizi.kcal, gizi.proteinG, gizi.carbsG, gizi.fatG],
  );
  const after = updated[0];
  if (!after) return null;

  // `log_status` dibuang dari snapshot: itu milik log induk, bukan itemnya,
  // dan `after` tidak punya kolom itu. Snapshot yang bentuknya berbeda antara
  // sebelum dan sesudah membuat perbandingannya nanti tidak bisa otomatis.
  const { log_status: _abaikan, ...beforeSnapshot } = before;

  await client.query(
    `INSERT INTO corrections (food_log_item_id, user_id, before, after, correction_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.itemId, input.userId, JSON.stringify(beforeSnapshot), JSON.stringify(after), input.type],
  );

  return { before, after };
}

export interface CorrectionReportRow {
  /** Nama makanan yang SALAH dikenali (nilai sebelum koreksi). */
  name_id: string | null;
  raw_label: string;
  jumlah: number;
  correction_type: string;
}

/**
 * Laporan koreksi: makanan mana yang paling sering salah dikenali (DoD M6).
 *
 * Dikelompokkan pada nilai **sebelum** koreksi, karena itulah tebakan yang
 * meleset — mengelompokkan pada nilai sesudah hanya memberi tahu makanan apa
 * yang populer, bukan di mana resolver rusak.
 *
 * `AT TIME ZONE` mengubah tengah malam **lokal** menjadi instan yang benar.
 * Tanpa itu, `'2026-08-13'::date` dibaca sebagai tengah malam UTC, dan semua
 * koreksi hari itu yang dibuat sebelum pukul 07:00 WIB hilang dari laporan —
 * persis jam sarapan, yang justru paling banyak koreksinya.
 *
 * Cast ke `timestamp`, **bukan** `date`, dan bedanya menentukan. Untuk masukan
 * `date`, Postgres memilih cast implisit ke `timestamptz` memakai timezone
 * **sesi** (UTC di server kita), lalu `AT TIME ZONE` justru mengubahnya ke arah
 * sebaliknya: batasnya bergeser ke 2026-08-13 00:00 UTC — lebih ketat, bukan
 * lebih longgar. Diukur saat verifikasi live: laporan mengembalikan nol baris
 * padahal ada dua koreksi yang jelas-jelas dibuat hari itu.
 */
export async function topCorrectedFoods(
  db: Q,
  sinceDate: string,
  limit = 20,
  timeZone = 'Asia/Jakarta',
): Promise<CorrectionReportRow[]> {
  const { rows } = await db.query<CorrectionReportRow>(
    `SELECT fi.name_id,
            c.before ->> 'raw_label' AS raw_label,
            c.correction_type,
            COUNT(*)::int AS jumlah
       FROM corrections c
       LEFT JOIN food_items fi ON fi.id = (c.before ->> 'food_item_id')::uuid
      WHERE c.created_at >= ($1::timestamp AT TIME ZONE $3)
      GROUP BY fi.name_id, c.before ->> 'raw_label', c.correction_type
      ORDER BY jumlah DESC, raw_label ASC
      LIMIT $2`,
    [sinceDate, limit, timeZone],
  );
  return rows;
}
