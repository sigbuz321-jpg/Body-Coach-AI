import { remaining } from './context';
import type { TruthSet } from './numbers';
import type { CoachContext } from './types';

/**
 * Hasil tool coach (docs/02-technical-spec.md §6.2).
 *
 * Yang dirender di sini adalah **jawaban tool**, bukan balasan ke pengguna.
 * Model menerimanya sebagai data lalu menyusun kalimatnya sendiri.
 *
 * ── Kenapa ini ada di domain murni ──
 *
 * Isi hasil tool adalah satu-satunya angka yang boleh dipakai model. Kalau
 * perakitannya tersebar di worker, cepat atau lambat ada cabang yang
 * memasukkan angka yang tidak pernah dihitung engine, dan AD-1 bocor lewat
 * pintu belakang — bukan lewat model yang mengarang, melainkan lewat kita yang
 * memberi bahan karangan. Karena itu perakitannya di sini, bersebelahan dengan
 * fungsi yang menyusun daftar kebenaran untuk memverifikasinya.
 *
 * Angka ditulis apa adanya (bukan format `id-ID`) karena pembacanya mesin.
 * Pemformatan terjadi saat model menulis kalimatnya, dan verifikasi §6.4
 * memang menerima kedua bentuk.
 */

/** Satu pilihan makanan dari food database, sudah dihitung untuk satu porsi. */
export interface FoodCandidate {
  readonly nameId: string;
  readonly portionLabel: string;
  readonly grams: number;
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
}

/**
 * Peringatan yang ikut di setiap hasil tool.
 *
 * Bukan hiasan: tanpa ini model cenderung "melengkapi" jawaban dengan angka
 * makanan yang tidak ada di daftar, dan setiap angka semacam itu akan ditolak
 * verifikasi lalu menjatuhkan seluruh balasan ke template. Menyebutkan
 * batasannya di tempat datanya jauh lebih efektif daripada di system prompt.
 */
const CATATAN =
  'Hanya angka di objek ini yang boleh kamu sebut. Jangan menjumlahkan atau menghitung ' +
  'angka sendiri. Kalau mau menyarankan makanan beserta angkanya, panggil recommend_meal ' +
  'dulu — jangan mengarang totalnya.';

export function dailyStatusJson(ctx: CoachContext): string {
  const sisa = remaining(ctx);
  return JSON.stringify({
    target: {
      kcal: ctx.target.kcal,
      protein_g: ctx.target.proteinG,
      karbo_g: ctx.target.carbsG,
      lemak_g: ctx.target.fatG,
    },
    sudah_masuk: {
      kcal: ctx.consumed.kcal,
      protein_g: ctx.consumed.proteinG,
      karbo_g: ctx.consumed.carbsG,
      lemak_g: ctx.consumed.fatG,
    },
    sisa: {
      kcal: sisa.kcal,
      protein_g: sisa.proteinG,
      karbo_g: sisa.carbsG,
      lemak_g: sisa.fatG,
    },
    sudah_lewat_target: sisa.overKcal,
    catatan: CATATAN,
  });
}

export function progressJson(ctx: CoachContext): string {
  return JSON.stringify({
    goal: ctx.goal,
    berat_sekarang_kg: ctx.currentWeightKg,
    berat_target_kg: ctx.targetWeightKg,
    tren_berat_7_hari: ctx.weightTrend
      ? { dari_kg: ctx.weightTrend.from, ke_kg: ctx.weightTrend.to }
      : null,
    hari_tercatat_dari_7: ctx.adherenceDays,
    catatan: CATATAN,
  });
}

/**
 * Peringatan khusus daftar makanan.
 *
 * Sengaja lebih keras daripada `CATATAN`, dan alasannya terukur. Pada uji live
 * 13 Agustus, model menjawab dengan satu makanan dari daftar lalu **menambah
 * sendiri** "putih telur rebus 2 butir (±70 kkal, ±12g protein)" — makanan yang
 * tidak ada di daftar, dengan angka yang tidak pernah dihitung siapa pun.
 * Verifikasi §6.4 menangkapnya dan seluruh balasan jatuh ke template, jadi
 * pengguna aman tapi kehilangan jawaban yang bagus.
 *
 * Menyebutkan konsekuensinya ("balasanmu dibuang") jauh lebih efektif daripada
 * larangan biasa: model punya alasan untuk patuh, bukan sekadar aturan.
 */
function catatanPilihan(jumlah: number): string {
  if (jumlah === 0) {
    return 'Tidak ada yang cocok di database. Bilang apa adanya ke user, jangan mengarang makanan.';
  }
  return (
    `${CATATAN} Sebut HANYA makanan dari daftar "pilihan" ini — itu isi food database kita. ` +
    'Kalau kamu menambah makanan lain beserta angkanya, seluruh balasanmu dibuang dan user ' +
    'dapat pesan template. Boleh menyebut makanan lain TANPA angka sama sekali.'
  );
}

export function candidatesJson(kandidat: readonly FoodCandidate[]): string {
  return JSON.stringify({
    pilihan: kandidat.map((c) => ({
      nama: c.nameId,
      porsi: c.portionLabel,
      gram: c.grams,
      kcal: c.kcal,
      protein_g: c.proteinG,
      karbo_g: c.carbsG,
      lemak_g: c.fatG,
    })),
    catatan: catatanPilihan(kandidat.length),
  });
}

/**
 * Jawaban untuk tool yang sengaja tidak dieksekusi.
 *
 * `update_weight` masuk kategori ini. Berat badan adalah masukan rekalibrasi
 * target, dan membiarkan model menetapkannya dari hasil bacaannya sendiri
 * berarti "sekitar 70 ribuan" bisa berubah menjadi berat 70 kg. Jalur
 * deterministik (`parseWeightMessage`) sudah menangani kalimat berat yang
 * jelas; yang tidak jelas lebih baik ditanyakan ulang.
 */
export function unsupportedToolJson(name: string): string {
  switch (name) {
    case 'update_weight':
      return JSON.stringify({
        error: 'tidak_dieksekusi',
        alasan: 'Update berat hanya diterima dari kalimat user yang jelas.',
        lakukan: 'Minta user mengetik beratnya sendiri, misal "berat gue 70,5 kg".',
      });
    default:
      return JSON.stringify({
        error: 'tool_tidak_dikenal',
        lakukan: 'Jawab pakai data yang sudah ada, jangan panggil tool ini lagi.',
      });
  }
}

/** Menambahkan angka kandidat makanan ke daftar kebenaran §6.4. */
export function truthWithCandidates(base: TruthSet, kandidat: readonly FoodCandidate[]): TruthSet {
  return {
    kcal: [...base.kcal, ...kandidat.map((c) => c.kcal)],
    protein: [...base.protein, ...kandidat.map((c) => c.proteinG)],
    carbs: [...base.carbs, ...kandidat.map((c) => c.carbsG)],
    fat: [...base.fat, ...kandidat.map((c) => c.fatG)],
  };
}

/**
 * Batas kalori yang wajar untuk satu saran makan.
 *
 * Sisa target sehari penuh bukan ukuran satu porsi: pengguna yang belum makan
 * apa pun punya sisa 2.882 kkal, dan menyarankan satu hidangan sebesar itu
 * bukan saran, melainkan tantangan. Diberi lantai supaya saat sisanya sudah
 * menipis, daftarnya tidak kosong dan coach tetap punya sesuatu untuk
 * ditawarkan.
 */
export function budgetKcalUntukSatuMakan(sisaKcal: number): number {
  return Math.max(250, Math.round(sisaKcal * 0.45));
}
