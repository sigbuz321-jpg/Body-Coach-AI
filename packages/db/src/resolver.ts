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

export interface FoodAlternative {
  readonly id: string;
  readonly nameId: string;
}

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
  /**
   * Kandidat lain yang kalah tipis, tanpa yang menang.
   *
   * Dibawa ikut supaya koreksi satu ketukan (M6) tidak perlu menjalankan
   * ulang pencarian: saat pengguna bilang "bukan itu", pilihannya sudah ada.
   * Kosong untuk kecocokan alias — di situ tidak ada keraguan yang perlu
   * ditawarkan alternatifnya.
   */
  readonly alternatives: readonly FoodAlternative[];
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

/**
 * Ambang untuk **mengambil kandidat**, bukan untuk memilih pemenang.
 *
 * Sengaja lebih rendah daripada ambang penerimaan, dan itu dua pekerjaan yang
 * berbeda: yang ketat menentukan apa yang boleh dicatat otomatis, yang longgar
 * menentukan apa yang boleh **ditawarkan** ke pengguna untuk dikoreksi.
 * Menyamakan keduanya membuat daftar koreksi kosong justru pada kasus yang
 * paling butuh koreksi — "ayam pnyet" memilih Ayam geprek (0,546) sementara
 * pesaing terdekatnya, Ayam pop (0,429), tidak pernah ikut terambil.
 */
const CANDIDATE_FLOOR = 0.3;

/**
 * Tingkat kedua: cocok yang meyakinkan **secara relatif**.
 *
 * [DEVIASI §5] §5 hanya mengenal satu ambang, 0,6. Diukur terhadap database
 * nyata, ambang itu menolak salah ketik satu huruf yang sebenarnya tidak
 * ambigu sama sekali: `capcai`→Capcay 0,556 · `risols`→Risoles 0,594 ·
 * `lontng`→Lontong 0,500 · `bubur ayem`→Bubur ayam 0,571. Semuanya kandidat
 * teratas, sebagian tanpa pesaing sama sekali.
 *
 * Sebabnya panjang string: similarity trigram turun tajam untuk kata pendek
 * karena jumlah trigramnya sedikit, jadi satu huruf salah memakan porsi yang
 * jauh lebih besar. Menurunkan ambang tunggal ke 0,5 akan mengobati itu tapi
 * juga melonggarkan kueri panjang yang justru harus ketat.
 *
 * Jadi yang dipakai bukan ambang lebih rendah, melainkan syarat berbeda:
 * di rentang 0,50–0,60, kecocokan diterima hanya kalau ia **unggul jelas** atas
 * kandidat kedua. Pertanyaannya bergeser dari "seberapa mirip" menjadi
 * "seberapa menentukan" — dan itu pertanyaan yang benar, karena yang berbahaya
 * bukan kemiripan rendah melainkan dua kandidat yang sama-sama mungkin.
 *
 * Hasilnya diberi confidence di bawah `NEEDS_CHECK_BELOW` (0,75), jadi selalu
 * ditandai "perlu dicek" ke pengguna. Ini tebakan yang diakui sebagai tebakan.
 */
const TRIGRAM_NEAR = 0.5;

/** Jarak minimum ke kandidat kedua supaya kecocokan tingkat dua diterima. */
const TRIGRAM_MARGIN = 0.08;

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
  const trigram = alias
    ? []
    : await searchByTrigram(db, norm.query, { threshold: CANDIDATE_FLOOR });

  const teratas = trigram[0];
  const kedua = trigram[1];
  const meyakinkan = teratas !== undefined && teratas.similarity >= TRIGRAM_ACCEPT;
  // Unggul jelas: tanpa pesaing, atau jaraknya cukup lebar. Tanpa syarat ini,
  // dua makanan yang sama-sama mungkin akan diputuskan oleh selisih 0,01.
  const menentukan =
    teratas !== undefined &&
    teratas.similarity >= TRIGRAM_NEAR &&
    teratas.similarity - (kedua?.similarity ?? 0) >= TRIGRAM_MARGIN;

  const hit = alias ?? (meyakinkan || menentukan ? teratas : null);

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
  // Kecocokan tingkat dua tidak pernah mencapai 0,75, jadi selalu sampai ke
  // pengguna dengan tanda "perlu dicek". Yang meyakinkan memakai rentang §5.
  const confidence = alias
    ? 1
    : meyakinkan
      ? clamp(teratas?.similarity ?? 0, 0.7, 0.9)
      : clamp(teratas?.similarity ?? 0, 0.5, 0.7);

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
      alternatives: trigram
        .filter((c) => c.id !== hit.id)
        .slice(0, 4)
        .map((c) => ({ id: c.id, nameId: c.name_id })),
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
