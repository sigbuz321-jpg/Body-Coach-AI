import { formatEstimate, formatGrams, formatInt, formatWeight } from '../format';
import { remaining } from './context';
import type { TruthSet } from './numbers';
import type { CoachContext, DailyTotals, Remaining } from './types';

/**
 * Balasan deterministik untuk WhatsApp.
 *
 * Semua fungsi di file ini merender angka yang **sudah** dihitung engine.
 * Tidak ada satu pun yang memanggil LLM, dan itu disengaja: jalur pencatatan
 * makanan adalah jalur yang paling sering dilewati dan paling padat angka,
 * jadi jalur itu tidak perlu melewati verifikasi §6.4 sama sekali — angkanya
 * tidak pernah punya kesempatan berubah.
 *
 * LLM tetap dipakai untuk pertanyaan bebas ("malam makan apa?"), dan di sana
 * verifikasi berlaku penuh.
 */

/** Satu item yang sudah diselesaikan resolver, siap ditampilkan. */
export interface LoggedItemView extends DailyTotals {
  /** Nama kanonik dari food database, bukan teks mentah pengguna. */
  readonly label: string;
  readonly grams: number;
  /** True bila confidence di bawah ambang dan pengguna sebaiknya memeriksa. */
  readonly needsCheck: boolean;
}

/** Ambang §5: di bawah ini item ditandai "perlu dicek". */
export const NEEDS_CHECK_BELOW = 0.75;

export function sumItems(items: readonly LoggedItemView[]): DailyTotals {
  return items.reduce<DailyTotals>(
    (a, i) => ({
      kcal: a.kcal + i.kcal,
      proteinG: a.proteinG + i.proteinG,
      carbsG: a.carbsG + i.carbsG,
      fatG: a.fatG + i.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** Sisa target seandainya `items` jadi dicatat. */
export function remainingAfter(ctx: CoachContext, items: readonly LoggedItemView[]): Remaining {
  const tambahan = sumItems(items);
  return remaining({
    ...ctx,
    consumed: {
      kcal: ctx.consumed.kcal + tambahan.kcal,
      proteinG: ctx.consumed.proteinG + tambahan.proteinG,
      carbsG: ctx.consumed.carbsG + tambahan.carbsG,
      fatG: ctx.consumed.fatG + tambahan.fatG,
    },
  });
}

function macroSuffix(t: DailyTotals): string {
  return `P${formatInt(t.proteinG)} K${formatInt(t.carbsG)} L${formatInt(t.fatG)}`;
}

function itemLine(i: LoggedItemView): string {
  const cek = i.needsCheck ? ' (perlu dicek)' : '';
  return `• ${i.label} ${formatGrams(i.grams)} — ${formatEstimate(i.kcal, 'kkal')} · ${macroSuffix(i)}${cek}`;
}

/**
 * Inti kalimat sisa target, huruf kecil dan tanpa tanda baca penutup.
 *
 * Dipisah dari kalimat pembungkusnya karena pemanggilnya menyambungnya dengan
 * dua cara: "Kalau dicatat, sisa …" (anak kalimat) dan "Tercatat. Sisa …"
 * (kalimat baru). Menempelkan prefiks apa adanya menghasilkan huruf kecil
 * setelah titik.
 *
 * Kondisi lewat target tidak pernah ditulis sebagai kegagalan (aturan copy:
 * "Tidak ada rasa bersalah"). Angkanya tetap disebut — menyembunyikannya
 * membuat produk terasa menghakimi lewat jalan lain.
 */
function intiSisa(sisa: Remaining, ctx: CoachContext): string {
  if (sisa.overKcal) {
    return `lewat target ${formatInt(ctx.consumed.kcal - ctx.target.kcal)} kkal`;
  }
  const bagian = [`sisa ${formatEstimate(sisa.kcal, 'kkal')}`];
  if (sisa.proteinG > 0) bagian.push(`protein kurang ${formatInt(sisa.proteinG)}g`);
  return bagian.join(' · ');
}

function kapital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Kalimat penenang yang selalu mengikuti kondisi lewat target. */
const SANTAI = 'Santai, besok normal lagi aja.';

/**
 * Balasan setelah makanan dikenali, sebelum dikonfirmasi.
 *
 * Lognya masih `pending` di sini: yang membuatnya masuk hitungan harian adalah
 * tombol "Catat". Karena itu sisanya ditulis sebagai bersyarat ("kalau
 * dicatat"), bukan sebagai fakta — menuliskannya seolah sudah masuk berarti
 * angka di WhatsApp berbeda dari angka di dashboard sampai tombolnya ditekan.
 */
export function renderFoodLogPreview(input: {
  readonly ctx: CoachContext;
  readonly items: readonly LoggedItemView[];
  readonly unresolved: readonly string[];
}): string {
  const { ctx, items, unresolved } = input;
  const total = sumItems(items);
  const sisa = remainingAfter(ctx, items);

  const baris: string[] = ['Gue tangkap ini:', ...items.map(itemLine)];

  if (items.length > 1) {
    baris.push('', `Total ${formatEstimate(total.kcal, 'kkal')} · ${macroSuffix(total)}.`);
  } else {
    baris.push('');
  }

  const sisaCtx: CoachContext = {
    ...ctx,
    consumed: {
      kcal: ctx.consumed.kcal + total.kcal,
      proteinG: ctx.consumed.proteinG + total.proteinG,
      carbsG: ctx.consumed.carbsG + total.carbsG,
      fatG: ctx.consumed.fatG + total.fatG,
    },
  };
  baris.push(
    `Kalau dicatat, ${intiSisa(sisa, sisaCtx)}.${sisa.overKcal ? ` ${SANTAI}` : ''}`.trim(),
  );

  if (unresolved.length > 0) {
    const daftar = unresolved.map((u) => `"${u}"`).join(', ');
    baris.push(
      `Yang belum ketemu: ${daftar}. Ketik nama makanannya lebih spesifik, nanti gue tambahin.`,
    );
  }

  return baris.join('\n');
}

/** Balasan setelah tombol "Catat" ditekan. */
export function renderLogConfirmed(ctx: CoachContext): string {
  const sisa = remaining(ctx);
  const inti = `Tercatat. ${kapital(intiSisa(sisa, ctx))}.`;
  if (sisa.overKcal) return `${inti} ${SANTAI}`;
  return `${inti} Kalau protein masih nyangkut, ayam sama telur paling gampang nutupnya.`;
}

/** Item setelah dikoreksi. Angkanya sudah dihitung ulang dari food database. */
export interface CorrectedItem {
  readonly nameId: string;
  readonly grams: number;
  readonly kcal: number;
  readonly proteinG: number;
}

/**
 * Balasan setelah koreksi satu ketukan diterapkan (M6).
 *
 * Menyebut angka barunya, bukan cuma "oke sudah diganti": pengguna baru saja
 * memberi tahu kita bahwa tebakan kita salah, dan hal paling masuk akal
 * berikutnya adalah menunjukkan bahwa perbaikannya benar-benar masuk.
 *
 * Sisa target **hanya** disebut kalau lognya sudah dikonfirmasi. Log yang masih
 * `pending` belum masuk hitungan harian, jadi menyebut sisanya setelah koreksi
 * menghasilkan kalimat yang membingungkan: pengguna baru saja memperbaiki
 * sebuah item lalu diberi tahu sisanya masih target penuh, seolah koreksinya
 * tidak berpengaruh. Yang benar di kondisi itu adalah mengingatkan tombolnya.
 *
 * `ctx` boleh `null` — target bisa saja belum ada. Tanpa target, sisanya tidak
 * disebut sama sekali, bukan ditulis nol.
 */
export function renderCorrectionApplied(
  item: CorrectedItem,
  ctx: CoachContext | null,
  opts: { readonly sudahDicatat: boolean },
): string {
  const inti =
    `Oke, gue ganti jadi ${item.nameId} ${formatGrams(item.grams)} — ` +
    `${formatEstimate(item.kcal, 'kkal')} · P${formatInt(item.proteinG)}.`;

  if (!opts.sudahDicatat) return `${inti} Tekan Catat kalau udah bener.`;
  if (!ctx) return `${inti} Makasih koreksinya.`;

  const sisa = remaining(ctx);
  return `${inti} ${kapital(intiSisa(sisa, ctx))}.`;
}

export function renderLogCancelled(): string {
  return 'Oke, gue batalin. Nggak masuk hitungan hari ini.';
}

export function renderPortionPrompt(): string {
  return (
    'Boleh, ketik porsinya aja — misal "setengah porsi" atau "2 potong", ' +
    'nanti gue itung ulang. Yang tadi gue batalin dulu ya.'
  );
}

/**
 * Balasan saat tidak satu pun makanan dikenali.
 *
 * Tidak menebak dan tidak minta maaf berlebihan; yang penting ada langkah
 * berikutnya yang konkret.
 */
export function renderNoFoodFound(): string {
  return (
    'Belum kebaca nih makanannya. Coba tulis nama makanannya aja, misal ' +
    '"nasi padang" atau "2 potong ayam geprek".'
  );
}

/** Balasan pertama setelah nomor berhasil ditautkan. */
export function renderPaired(ctx: CoachContext): string {
  const sapaan = ctx.displayName ? `Halo ${ctx.displayName}!` : 'Halo!';
  return (
    `${sapaan} Nomor kamu udah nyambung. ` +
    `Target hari ini ${formatInt(ctx.target.kcal)} kkal · P${formatInt(ctx.target.proteinG)} · ` +
    `K${formatInt(ctx.target.carbsG)} · L${formatInt(ctx.target.fatG)}.\n\n` +
    'Mulai aja: ketik apa yang barusan kamu makan, atau kirim fotonya.'
  );
}

/**
 * Balasan untuk nomor yang belum ditautkan.
 *
 * Tanpa satu angka pun: kita belum tahu nomor ini milik siapa, dan mengirim
 * target siapa pun ke nomor yang belum terverifikasi adalah kebocoran data
 * kesehatan.
 */
export function renderNotLinked(appUrl: string): string {
  return (
    'Nomor ini belum tersambung ke akun mana pun. Selesaikan dulu pengaturan ' +
    `awal di ${appUrl}, nanti kamu dapat kode MULAI- yang tinggal dikirim ke sini.`
  );
}

export type PairFailure = 'not_found' | 'expired' | 'already_used' | 'wa_taken';

export function renderPairFailure(kind: PairFailure, appUrl: string): string {
  switch (kind) {
    case 'not_found':
      return `Kode itu nggak dikenali. Cek lagi di ${appUrl}, kodenya berbentuk MULAI-XXXXXX.`;
    case 'expired':
      return `Kodenya udah kedaluwarsa (berlaku 24 jam). Buka lagi ${appUrl} buat dapat kode baru.`;
    case 'already_used':
      return 'Kode itu udah kepakai. Kalau nomor ini belum nyambung, ambil kode baru di halaman rencana kamu.';
    case 'wa_taken':
      return (
        'Nomor ini udah nempel ke akun lain. Kalau itu akun kamu juga, ' +
        'lepas dulu sambungannya dari halaman Akun sebelum nyambungin ke sini.'
      );
  }
}

/** Balasan setelah berat badan tersimpan. */
export function renderWeightSaved(kg: number, previousKg: number | null): string {
  const inti = `Tercatat, ${formatWeight(kg)}.`;
  if (previousKg === null) return `${inti} Timbang lagi 3–4 hari sekali ya, biar trennya kebaca.`;

  const delta = kg - previousKg;
  if (Math.abs(delta) < 0.05) return `${inti} Stabil dari terakhir. Lanjut aja.`;

  const arah = delta > 0 ? 'naik' : 'turun';
  return `${inti} ${arah.charAt(0).toUpperCase()}${arah.slice(1)} ${formatWeight(Math.abs(delta))} dari terakhir kamu timbang.`;
}

/**
 * Daftar angka yang boleh muncul di balasan LLM saat item baru dicatat.
 *
 * Selain target/konsumsi/sisa dari konteks, angka tiap item dan totalnya juga
 * sah — model memang sedang membicarakannya.
 */
export function truthForItems(
  ctx: CoachContext,
  items: readonly LoggedItemView[],
  base: TruthSet,
): TruthSet {
  const total = sumItems(items);
  const sisa = remainingAfter(ctx, items);
  return {
    kcal: [...base.kcal, ...items.map((i) => i.kcal), total.kcal, sisa.kcal],
    protein: [...base.protein, ...items.map((i) => i.proteinG), total.proteinG, sisa.proteinG],
    carbs: [...base.carbs, ...items.map((i) => i.carbsG), total.carbsG, sisa.carbsG],
    fat: [...base.fat, ...items.map((i) => i.fatG), total.fatG, sisa.fatG],
  };
}
