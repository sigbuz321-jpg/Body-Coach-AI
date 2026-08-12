import {
  normalizeFoodQuery,
  nutritionForGrams,
  splitFoodItems,
  type Nutrition,
} from '@bodycoach/core';
import type { Pool, PoolClient } from 'pg';

import { findByAlias, getDefaultPortion, searchByTrigram } from './repositories/food';
import type { MatchStage } from './types';

type Q = Pool | PoolClient;

/**
 * Food resolver, tahap 1–2 (docs/02-technical-spec.md §5).
 *
 * Tahap 3 (vector kNN) menyusul di M6 bersama pengisian embedding — sampai
 * kolom `food_items.embedding` terisi, tahap itu hanya menambah latensi dan
 * biaya tanpa menambah satu pun kecocokan.
 *
 * Yang tidak dilakukan resolver ini: menebak. Kalau tidak ada kecocokan yang
 * cukup meyakinkan, hasilnya `needsClarification` — pengguna ditanya, bukan
 * diberi angka yang kelihatan pasti padahal karangan.
 */

export interface ResolvedFood {
  readonly rawLabel: string;
  readonly foodItemId: string;
  readonly nameId: string;
  readonly grams: number;
  readonly portionBasis: 'user_stated' | 'default';
  readonly portionLabel: string;
  readonly matchStage: MatchStage;
  readonly confidence: number;
  readonly nutrition: Nutrition;
}

export interface UnresolvedFood {
  readonly rawLabel: string;
  readonly query: string;
  /** Kandidat terdekat untuk ditawarkan sebagai pilihan. */
  readonly candidates: readonly { readonly id: string; readonly nameId: string }[];
}

export type FoodResolution =
  | { readonly kind: 'resolved'; readonly item: ResolvedFood }
  | { readonly kind: 'unresolved'; readonly item: UnresolvedFood };

/** Ambang §5. Di bawah `TRIGRAM_ACCEPT`, resolver menolak menebak. */
const TRIGRAM_ACCEPT = 0.6;
const TRIGRAM_FLOOR = 0.45;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Porsi dalam gram.
 *
 * Prioritas §5: yang disebut pengguna menang atas porsi default. Pengali
 * dibatasi 0,25–4 — "10 porsi nasi padang" hampir pasti salah ketik atau
 * bercanda, dan mencatat 7.350 kkal karenanya merusak seluruh rekap hari itu.
 */
function resolveGrams(
  defaultGrams: number,
  multiplier: number | null,
): { grams: number; basis: 'user_stated' | 'default' } {
  if (multiplier === null) return { grams: defaultGrams, basis: 'default' };
  return { grams: defaultGrams * clamp(multiplier, 0.25, 4), basis: 'user_stated' };
}

async function resolveOne(db: Q, rawLabel: string): Promise<FoodResolution> {
  const norm = normalizeFoodQuery(rawLabel);
  if (norm.query.length === 0) {
    return { kind: 'unresolved', item: { rawLabel, query: '', candidates: [] } };
  }

  // Tahap 1 — alias eksak. Paling murah, paling akurat.
  const alias = await findByAlias(db, norm.query);
  const trigram = alias ? [] : await searchByTrigram(db, norm.query, { threshold: TRIGRAM_FLOOR });

  const hit = alias ?? (trigram[0] && trigram[0].similarity >= TRIGRAM_ACCEPT ? trigram[0] : null);

  if (!hit) {
    return {
      kind: 'unresolved',
      item: {
        rawLabel,
        query: norm.query,
        candidates: trigram.slice(0, 3).map((c) => ({ id: c.id, nameId: c.name_id })),
      },
    };
  }

  const stage: MatchStage = alias ? 'alias' : 'trigram';
  const confidence = alias ? 1 : clamp(trigram[0]?.similarity ?? 0, 0.7, 0.9);

  const portion = await getDefaultPortion(db, hit.id);
  // Tanpa porsi default, 100 g adalah satu-satunya asumsi yang jujur: itulah
  // basis angka di food_items. Seed menjamin setiap makanan punya porsi
  // default, jadi cabang ini hanya terpakai untuk data yang masuk di luar seed.
  const defaultGrams = portion ? Number(portion.grams) : 100;
  const { grams, basis } = resolveGrams(defaultGrams, norm.portionMultiplier);

  return {
    kind: 'resolved',
    item: {
      rawLabel,
      foodItemId: hit.id,
      nameId: hit.name_id,
      grams,
      portionBasis: basis,
      portionLabel: portion?.label ?? '100 g',
      matchStage: stage,
      confidence,
      nutrition: nutritionForGrams(
        {
          kcal: Number(hit.kcal_per_100g),
          proteinG: Number(hit.protein_per_100g),
          carbsG: Number(hit.carbs_per_100g),
          fatG: Number(hit.fat_per_100g),
        },
        grams,
      ),
    },
  };
}

/**
 * Menyelesaikan satu kalimat menjadi beberapa makanan.
 *
 * "Tadi gue makan nasi sama ayam geprek" -> dua hasil terpisah, masing-masing
 * dengan gizinya sendiri dari database (DoD M5).
 */
export async function resolveFoodText(db: Q, rawText: string): Promise<FoodResolution[]> {
  const potongan = splitFoodItems(rawText);
  const hasil: FoodResolution[] = [];
  for (const p of potongan) {
    hasil.push(await resolveOne(db, p));
  }
  return hasil;
}

/** Menjumlahkan gizi dari hasil yang berhasil diselesaikan. */
export function sumNutrition(resolutions: readonly FoodResolution[]): Nutrition {
  return resolutions.reduce<Nutrition>(
    (acc, r) =>
      r.kind === 'resolved'
        ? {
            kcal: acc.kcal + r.item.nutrition.kcal,
            proteinG: acc.proteinG + r.item.nutrition.proteinG,
            carbsG: acc.carbsG + r.item.nutrition.carbsG,
            fatG: acc.fatG + r.item.nutrition.fatG,
          }
        : acc,
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}
