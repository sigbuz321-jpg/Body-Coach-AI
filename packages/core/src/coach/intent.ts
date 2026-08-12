/**
 * Pemilahan niat pesan sebelum food resolver dijalankan.
 *
 * Alasannya satu kasus konkret: "enaknya makan ayam geprek gak ya?" bukan
 * catatan makanan, tapi resolver akan dengan senang hati mencocokkan "ayam
 * geprek" dan mencatat 342 kkal yang tidak pernah dimakan siapa pun. Angka
 * yang salah masuk ke rekap harian jauh lebih merusak kepercayaan daripada
 * pertanyaan yang dijawab agak melenceng.
 *
 * Karena itu pemilahan ini condong ke arah "anggap pertanyaan": salah menahan
 * pencatatan hanya berarti pengguna mengulang kalimatnya.
 */

/** Kata tanya yang mengawali kalimat. */
const QUESTION_OPENERS =
  /^(apa|apakah|berapa|brp|gimana|bagaimana|kenapa|napa|kapan|mana|boleh|bisa|enak|enaknya|mending|mendingan|saran|saranin|rekomen|rekomendasi|recommend|kasih saran|menurut)\b/;

/**
 * Frasa tanya yang muncul di tengah kalimat. Sengaja pendek dan spesifik —
 * daftar panjang yang samar akan menahan pencatatan yang sah.
 */
const QUESTION_MARKERS =
  /\b(berapa kalori|berapa kkal|berapa protein|makan apa|apa ya|gak ya|nggak ya|ga ya|enaknya apa|bagusnya apa|sisa (kalori|protein)|masih (boleh|bisa)|harus makan)\b/;

/**
 * True bila pesan lebih mirip pertanyaan daripada laporan makan.
 *
 * Tanda tanya sendiri sudah cukup: orang yang melaporkan makanan tidak
 * mengetiknya.
 */
export function looksLikeQuestion(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length === 0) return false;
  if (t.includes('?')) return true;
  return QUESTION_OPENERS.test(t) || QUESTION_MARKERS.test(t);
}
