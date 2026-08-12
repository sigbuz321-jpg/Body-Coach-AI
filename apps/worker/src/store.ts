import { shiftDate, type CoachContext } from '@bodycoach/core';
import {
  addFoodLogItems,
  consumeLinkToken,
  countLoggedDays,
  createFoodLog,
  getDailyTotals,
  getLatestWeight,
  getPool,
  getProfile,
  getTargetOn,
  listWeights,
  recordMessage,
  resolveFoodText,
  setFoodLogStatus,
  upsertWeight,
  withTransaction,
  type FoodLogItemInput,
  type FoodResolution,
} from '@bodycoach/db';

import type { PairOutcome, Store } from './functions/message-received';

/**
 * `Store` nyata di atas `@bodycoach/db`.
 *
 * Semua konversi `string -> number` terjadi di sini dan hanya di sini. Driver
 * `pg` mengembalikan kolom `numeric` sebagai string (presisi arbitrer tidak
 * muat di `number` tanpa kehilangan); membiarkan string itu mengalir ke lapisan
 * coach berarti `ctx.target.kcal - ctx.consumed.kcal` menghasilkan `NaN` atau,
 * lebih buruk, penggabungan string.
 */

/** Jendela tren dan adherence: hari ini plus enam hari ke belakang. */
const WINDOW_DAYS = 6;

function toItems(resolutions: readonly FoodResolution[]): FoodLogItemInput[] {
  const out: FoodLogItemInput[] = [];
  for (const r of resolutions) {
    if (r.kind !== 'resolved') continue;
    const i = r.item;
    out.push({
      foodItemId: i.foodItemId,
      rawLabel: i.rawLabel,
      grams: i.grams,
      portionBasis: i.portionBasis,
      matchStage: i.matchStage,
      confidence: i.confidence,
      kcal: i.nutrition.kcal,
      proteinG: i.nutrition.proteinG,
      carbsG: i.nutrition.carbsG,
      fatG: i.nutrition.fatG,
    });
  }
  return out;
}

export function createStore(): Store {
  return {
    async findUserIdByWaId(waId) {
      const { rows } = await getPool().query<{ id: string }>(
        'SELECT id FROM users WHERE wa_id = $1 AND deleted_at IS NULL',
        [waId],
      );
      return rows[0]?.id ?? null;
    },

    async pairToken(token, waId): Promise<PairOutcome> {
      // Transaksi wajib: `consumeLinkToken` memakai SELECT ... FOR UPDATE, dan
      // row lock tanpa transaksi dilepas seketika.
      return withTransaction((client) => consumeLinkToken(client, token, waId));
    },

    async loadContext(userId, localDate, hourWib): Promise<CoachContext | null> {
      const db = getPool();

      const [profile, target] = await Promise.all([
        getProfile(db, userId),
        getTargetOn(db, userId, localDate),
      ]);
      // Tanpa salah satunya, onboarding belum tuntas dan tidak ada angka yang
      // boleh dikirim. Bukan kondisi error — cukup sering terjadi kalau
      // pengguna menautkan nomor lalu berhenti di tengah jalan.
      if (!profile || !target) return null;

      const sejak = shiftDate(localDate, -WINDOW_DAYS);
      const [totals, weights, adherenceDays, terakhir] = await Promise.all([
        getDailyTotals(db, userId, localDate),
        listWeights(db, userId, sejak),
        countLoggedDays(db, userId, sejak),
        getLatestWeight(db, userId),
      ]);

      const awal = weights[0];
      const akhir = weights[weights.length - 1];

      return {
        displayName: profile.display_name,
        goal: target.goal,
        currentWeightKg: terakhir ? Number(terakhir.weight_kg) : Number(profile.start_weight_kg),
        targetWeightKg: Number(profile.target_weight_kg),
        target: {
          goal: target.goal,
          kcal: target.kcal,
          proteinG: target.protein_g,
          carbsG: target.carbs_g,
          fatG: target.fat_g,
        },
        consumed: {
          kcal: Number(totals.kcal),
          proteinG: Number(totals.protein_g),
          carbsG: Number(totals.carbs_g),
          fatG: Number(totals.fat_g),
        },
        hourWib,
        foodPrefs: profile.food_prefs,
        budgetPerMealIdr: profile.budget_per_meal,
        // Dua titik di hari yang sama bukan tren. `awal !== akhir` memastikan
        // yang dibandingkan benar-benar dua pengukuran berbeda.
        weightTrend:
          weights.length >= 2 && awal && akhir
            ? { from: Number(awal.weight_kg), to: Number(akhir.weight_kg) }
            : null,
        adherenceDays,
      };
    },

    resolveFood(text) {
      return resolveFoodText(getPool(), text);
    },

    async createPendingLog(input) {
      return withTransaction(async (client) => {
        const log = await createFoodLog(client, {
          userId: input.userId,
          localDate: input.localDate,
          mealSlot: input.mealSlot,
          source: 'wa_text',
          sourceMessageId: input.sourceMessageId,
          // `pending`, bukan `confirmed`: yang memasukkannya ke hitungan harian
          // adalah tombol "Catat". Sampai itu ditekan, angka di WhatsApp dan
          // angka di dashboard harus sama-sama belum berubah.
          status: 'pending',
        });
        // `null` berarti `source_message_id` bentrok — pesan ini sudah pernah
        // diproses. Lapis kedua idempotency (AD-2).
        if (!log) return null;

        await addFoodLogItems(client, log.id, toItems(input.items));
        return log.id;
      });
    },

    async setLogStatus(input) {
      const row = await setFoodLogStatus(getPool(), input);
      return row !== null;
    },

    async recordMessage(input) {
      await recordMessage(getPool(), {
        userId: input.userId,
        waMessageId: input.waMessageId,
        direction: input.direction,
        kind: input.kind,
        body: input.body ?? null,
      });
    },

    async latestWeightKg(userId) {
      const row = await getLatestWeight(getPool(), userId);
      return row ? Number(row.weight_kg) : null;
    },

    async saveWeight(userId, localDate, kg) {
      await upsertWeight(getPool(), userId, localDate, kg);
    },
  };
}
