import { formatInt } from '../format';
import { remaining } from './context';
import type { CoachContext } from './types';

/**
 * Verifikasi angka balasan coach (docs/02-technical-spec.md §6.4).
 *
 * Ini titik penegakan AD-1: LLM boleh menyusun kalimat, tapi tidak boleh
 * menjadi sumber angka. Sebelum balasan dikirim, angka di dalamnya dicocokkan
 * dengan hasil engine; kalau ada yang tidak cocok, balasan dibuang dan diganti
 * template deterministik. Bukan retry — mengulang ke model yang sama untuk
 * masalah yang sama hanya membakar token.
 *
 * ── Apa yang diperiksa, dan kenapa tidak semuanya ──
 *
 * Balasan coach sah-sah saja memuat angka yang bukan klaim gizi:
 *
 *   "Protein lo masih kurang 42g. 150g ayam + 2 telur udah nutup kok."
 *
 * `42g` adalah klaim tentang data user dan wajib cocok. `150g` adalah saran
 * porsi, `2` adalah hitungan telur — keduanya bukan klaim tentang angka yang
 * dihitung engine. Menolak balasan karena `150g` tidak ada di daftar
 * kebenaran akan membuat fallback menyala hampir setiap saat, dan produk
 * kehilangan justru bagian yang membuatnya berguna: saran langkah berikutnya.
 *
 * Karena itu yang diverifikasi hanya dua bentuk yang selalu berupa klaim:
 * 1. Kalori — angka apa pun yang diikuti "kkal"/"kalori".
 * 2. Makro — angka gram yang bersanding dengan kata protein/karbo/lemak,
 *    termasuk bentuk singkat `P42`.
 */

export type ClaimKind = 'kcal' | 'protein' | 'carbs' | 'fat';

export interface NumberClaim {
  readonly kind: ClaimKind;
  readonly value: number;
  /** Potongan teks asal, untuk log saat tidak cocok. */
  readonly source: string;
}

/** Angka sah yang boleh muncul di balasan, dikelompokkan per jenis. */
export interface TruthSet {
  readonly kcal: readonly number[];
  readonly protein: readonly number[];
  readonly carbs: readonly number[];
  readonly fat: readonly number[];
}

/** `1.830` / `1830` / `63,4` -> number. Format id-ID, bukan en-US. */
function parseIdNumber(raw: string): number {
  return Number(raw.replace(/\./g, '').replace(',', '.'));
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?`;

const KCAL_RE = new RegExp(String.raw`[±~]?\s*(${NUM})\s*(?:kkal|kalori|kcal)`, 'gi');

/**
 * "protein 42g", "protein lo masih kurang 42g", "protein: 42 g".
 *
 * Antara kata makro dan angkanya boleh ada sisipan pendek ("lo masih kurang"),
 * tapi tidak boleh melewati akhir kalimat — tanpa batas itu, "Protein aman.
 * Nasi 150g" terbaca sebagai klaim protein 150g. Satuan `g` diwajibkan supaya
 * "protein dari 2 telur" tidak ikut tertangkap.
 */
const MACRO_WORD_FIRST = new RegExp(
  String.raw`(protein|karbohidrat|karbo|lemak)[^\d\n.!?]{0,25}?[±~]?\s*(${NUM})\s*g\b`,
  'gi',
);
const MACRO_NUM_FIRST = new RegExp(
  String.raw`[±~]?\s*(${NUM})\s*g\s*(protein|karbohidrat|karbo|lemak)`,
  'gi',
);
const MACRO_SHORT = new RegExp(String.raw`\b([PKL])\s?(${NUM})\b`, 'g');

function macroKind(word: string): ClaimKind {
  const w = word.toLowerCase();
  if (w.startsWith('p')) return 'protein';
  if (w.startsWith('k')) return 'carbs';
  return 'fat';
}

/** Mengambil klaim angka dari balasan coach. */
export function extractClaims(text: string): NumberClaim[] {
  const out: NumberClaim[] = [];

  for (const m of text.matchAll(KCAL_RE)) {
    out.push({ kind: 'kcal', value: parseIdNumber(m[1] ?? '0'), source: m[0].trim() });
  }
  for (const m of text.matchAll(MACRO_WORD_FIRST)) {
    out.push({
      kind: macroKind(m[1] ?? ''),
      value: parseIdNumber(m[2] ?? '0'),
      source: m[0].trim(),
    });
  }
  for (const m of text.matchAll(MACRO_NUM_FIRST)) {
    out.push({
      kind: macroKind(m[2] ?? ''),
      value: parseIdNumber(m[1] ?? '0'),
      source: m[0].trim(),
    });
  }
  for (const m of text.matchAll(MACRO_SHORT)) {
    out.push({
      kind: macroKind(m[1] ?? ''),
      value: parseIdNumber(m[2] ?? '0'),
      source: m[0].trim(),
    });
  }
  return out;
}

export interface VerificationResult {
  readonly ok: boolean;
  /** Klaim yang tidak ditemukan di daftar kebenaran. */
  readonly offending: readonly NumberClaim[];
}

/**
 * Membandingkan klaim dengan angka engine.
 *
 * Toleransi 2% (§6.4) menampung pembulatan model — "±735" vs "±740" bukan
 * kebohongan, "±870" iya. Toleransi absolut 1 dipakai untuk angka kecil,
 * karena 2% dari 30g protein hanya 0,6g dan akan menolak pembulatan wajar.
 */
export function verifyCoachNumbers(
  text: string,
  truth: TruthSet,
  tolerance = 0.02,
): VerificationResult {
  const claims = extractClaims(text);
  const offending: NumberClaim[] = [];

  for (const claim of claims) {
    const allowed = truth[claim.kind === 'kcal' ? 'kcal' : claim.kind];
    const cocok = allowed.some((t) => {
      const batas = Math.max(1, Math.abs(t) * tolerance);
      return Math.abs(t - claim.value) <= batas;
    });
    if (!cocok) offending.push(claim);
  }

  return { ok: offending.length === 0, offending };
}

/**
 * Balasan pengganti saat verifikasi gagal.
 *
 * Ditulis dengan suara coach (§ "Copy & voice"), bukan pesan error: dari sisi
 * pengguna tidak ada yang salah, mereka cuma menerima jawaban yang lebih
 * ringkas. Selalu ada langkah berikutnya — angka tanpa saran belum selesai.
 */
export function renderDeterministicTemplate(ctx: CoachContext): string {
  const sisa = remaining(ctx);

  if (sisa.overKcal) {
    const lewat = ctx.consumed.kcal - ctx.target.kcal;
    return (
      `Hari ini lewat ${formatInt(lewat)} kkal dari target. Santai, besok normal lagi aja. ` +
      `Besok mulai dari sarapan yang ada proteinnya biar gampang ngejar.`
    );
  }

  const bagian = [`Sisa hari ini ${formatInt(sisa.kcal)} kkal`];
  if (sisa.proteinG > 0) bagian.push(`protein kurang ${formatInt(sisa.proteinG)}g`);

  return `${bagian.join(', ')}. Kalau mau simpel, ayam sama telur udah nutup sisanya.`;
}

/** Daftar kebenaran dari konteks: target, konsumsi, dan sisa boleh disebut. */
export function truthFromContext(ctx: CoachContext): TruthSet {
  const sisa = remaining(ctx);
  return {
    kcal: [ctx.target.kcal, ctx.consumed.kcal, sisa.kcal],
    protein: [ctx.target.proteinG, ctx.consumed.proteinG, sisa.proteinG],
    carbs: [ctx.target.carbsG, ctx.consumed.carbsG, sisa.carbsG],
    fat: [ctx.target.fatG, ctx.consumed.fatG, sisa.fatG],
  };
}
