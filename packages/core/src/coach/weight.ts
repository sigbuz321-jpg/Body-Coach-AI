/**
 * Deteksi pesan update berat badan.
 *
 * Ini bukan fitur tambahan, melainkan penjaga: tanpa deteksi ini "berat gue
 * 70kg" masuk ke food resolver, dan trigram akan dengan senang hati
 * mencocokkan potongan katanya ke makanan mana pun yang mirip. Pengguna
 * mendapat log makanan yang tidak pernah mereka makan.
 *
 * Sengaja ketat. Kalau ragu, `null` — pesannya diteruskan ke jalur biasa dan
 * paling buruk pengguna mengulang dengan kalimat lain. Salah menebak angka
 * berat badan jauh lebih mahal: berat adalah masukan rekalibrasi target.
 */

/** Batas yang sama dengan CHECK di `weight_entries` (§3). */
const MIN_KG = 30;
const MAX_KG = 300;

const NUM = String.raw`\d{2,3}(?:[.,]\d{1,2})?`;

/**
 * "berat gue 70,5", "bb sekarang 70 kg", "berat badan: 70".
 * Sisipan antara kata kunci dan angka dibatasi supaya kalimat panjang yang
 * kebetulan menyebut "berat" tidak ikut tertangkap.
 */
const WITH_KEYWORD = new RegExp(
  String.raw`\b(?:berat(?:\s*badan)?|bb|timbang(?:an)?)\b[^\d\n]{0,16}(${NUM})\s*(?:kg|kilo|kilogram)?\b`,
  'i',
);

/** Pesan yang isinya memang cuma angka dan satuannya: "70,5 kg". */
const BARE = new RegExp(String.raw`^\s*(${NUM})\s*(?:kg|kilo|kilogram)\s*$`, 'i');

/**
 * Mengembalikan berat dalam kg, atau `null` bila pesannya bukan update berat.
 * Nilai di luar 30–300 kg ditolak: itu pasti salah ketik, dan `weight_entries`
 * akan menolaknya di constraint.
 */
export function parseWeightMessage(text: string): number | null {
  const m = BARE.exec(text) ?? WITH_KEYWORD.exec(text);
  if (!m) return null;

  const kg = Number((m[1] ?? '').replace(',', '.'));
  if (!Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG) return null;
  return kg;
}
