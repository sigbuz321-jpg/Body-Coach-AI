/**
 * Menyesuaikan teks model ke format WhatsApp.
 *
 * WhatsApp bukan Markdown. Tebal ditulis `*satu bintang*`, bukan `**dua**`;
 * `**tebal**` tidak dirender dan pengguna melihat bintang-bintangnya apa
 * adanya. Model dilatih pada Markdown dan tetap memakainya sekalipun system
 * prompt tidak memintanya — pada uji live 13 Agustus, balasan rekomendasi
 * makan datang penuh `**Saran malam ini:**` dan daftar bertanda.
 *
 * Ini pembersihan bentuk, bukan perubahan isi: tidak ada angka yang bergeser,
 * jadi urutannya terhadap verifikasi §6.4 tidak penting. Dijalankan setelah
 * verifikasi supaya yang diperiksa adalah teks apa adanya dari model.
 */

/** `**tebal**` -> `*tebal*`. Non-greedy supaya dua pasang tidak menyatu. */
const TEBAL_GANDA = /\*\*(.+?)\*\*/gs;

/** `__miring__` -> `_miring_`. */
const MIRING_GANDA = /__(.+?)__/gs;

/** Judul Markdown tidak ada di WhatsApp; jadikan baris tebal biasa. */
const JUDUL = /^\s{0,3}#{1,6}\s+(.+?)\s*$/gm;

/** Tanda daftar `- ` dan `* ` di awal baris diseragamkan jadi bullet. */
const PENANDA_DAFTAR = /^\s{0,3}[-*]\s+/gm;

export function toWhatsAppText(raw: string): string {
  return (
    raw
      .replace(JUDUL, '*$1*')
      .replace(TEBAL_GANDA, '*$1*')
      .replace(MIRING_GANDA, '_$1_')
      .replace(PENANDA_DAFTAR, '• ')
      // Tiga baris kosong atau lebih tidak menambah apa pun selain panjang.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
