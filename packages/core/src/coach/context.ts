import { formatInt, formatKg } from '../format';
import type { CoachContext, MealSlot, Remaining } from './types';

/**
 * Perakit `user_context_block` (docs/02-technical-spec.md §6.1).
 *
 * Dirakit **deterministik**, bukan oleh LLM. Ini penting bukan soal gaya:
 * blok ini adalah satu-satunya sumber angka yang dilihat model. Kalau model
 * ikut menyusunnya, angka bisa berubah di jalan dan AD-1 bocor lewat pintu
 * belakang.
 */

/** Sisa target. Dijepit di nol — "sisa -300 kkal" bukan kalimat yang berguna. */
export function remaining(ctx: CoachContext): Remaining {
  const kcal = ctx.target.kcal - ctx.consumed.kcal;
  return {
    kcal: Math.max(0, kcal),
    proteinG: Math.max(0, ctx.target.proteinG - ctx.consumed.proteinG),
    carbsG: Math.max(0, ctx.target.carbsG - ctx.consumed.carbsG),
    fatG: Math.max(0, ctx.target.fatG - ctx.consumed.fatG),
    overKcal: kcal < 0,
  };
}

/**
 * Slot makan berikutnya menurut jam WIB.
 *
 * Batasnya mengikuti pola makan Indonesia, bukan pembagian tiga jam yang rata:
 * makan malam di sini bergeser lebih larut daripada konvensi Barat.
 */
export function mealSlotForHour(hourWib: number): MealSlot {
  if (hourWib < 10) return 'sarapan';
  if (hourWib < 15) return 'makan_siang';
  if (hourWib < 21) return 'makan_malam';
  return 'snack';
}

const SLOT_LABEL: Record<MealSlot, string> = {
  sarapan: 'sarapan',
  makan_siang: 'makan siang',
  makan_malam: 'makan malam',
  snack: 'camilan',
};

function jam(hourWib: number): string {
  return `${String(hourWib).padStart(2, '0')}:00 WIB`;
}

/**
 * Blok konteks yang disisipkan ke system prompt.
 *
 * Format mengikuti §6.1 apa adanya. Angka lewat helper `id-ID` yang sama
 * dengan yang dipakai web, jadi "1.830" di WhatsApp dan di dashboard ditulis
 * dengan cara yang sama.
 */
export function buildUserContextBlock(ctx: CoachContext): string {
  const sisa = remaining(ctx);
  const slot = mealSlotForHour(ctx.hourWib);

  const nama = ctx.displayName ?? 'belum diisi';
  const baris: string[] = [
    `Nama: ${nama} · Goal: ${ctx.goal.toUpperCase()} · ` +
      `${formatKg(ctx.currentWeightKg)} → ${formatKg(ctx.targetWeightKg)} kg`,
    `Target hari ini: ${formatInt(ctx.target.kcal)} kkal · P${formatInt(ctx.target.proteinG)} · ` +
      `K${formatInt(ctx.target.carbsG)} · L${formatInt(ctx.target.fatG)}`,
    `Sudah masuk: ${formatInt(ctx.consumed.kcal)} kkal · P${formatInt(ctx.consumed.proteinG)} · ` +
      `K${formatInt(ctx.consumed.carbsG)} · L${formatInt(ctx.consumed.fatG)}` +
      (sisa.overKcal
        ? `   (sudah lewat target ${formatInt(ctx.consumed.kcal - ctx.target.kcal)} kkal)`
        : `   (sisa: ${formatInt(sisa.kcal)} kkal · P${formatInt(sisa.proteinG)})`),
    `Waktu: ${jam(ctx.hourWib)} · Slot berikutnya: ${SLOT_LABEL[slot]}`,
  ];

  const prefs = ctx.foodPrefs.length > 0 ? ctx.foodPrefs.join(', ') : 'tidak ada';
  const budget =
    ctx.budgetPerMealIdr === null ? 'tidak disebut' : `±${formatInt(ctx.budgetPerMealIdr)}`;
  baris.push(`Preferensi: ${prefs} · Budget/makan: ${budget}`);

  if (ctx.weightTrend) {
    const delta = ctx.weightTrend.to - ctx.weightTrend.from;
    const tanda = delta > 0 ? '+' : delta < 0 ? '−' : '';
    baris.push(
      `Berat 7 hari terakhir (EMA): ${formatKg(ctx.weightTrend.from)} → ` +
        `${formatKg(ctx.weightTrend.to)} (${tanda}${formatKg(Math.abs(delta))})`,
    );
  } else {
    baris.push('Berat 7 hari terakhir: belum cukup data');
  }

  baris.push(`Adherence 7 hari: ${ctx.adherenceDays}/7 hari tercatat`);

  return baris.join('\n');
}
