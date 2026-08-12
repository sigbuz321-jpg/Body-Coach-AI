/**
 * Deep link `wa.me` untuk pairing (docs/01-system-design.md §4.1).
 *
 * Dibangun di **server** dan dikirim sebagai bagian respons onboarding, bukan
 * dirakit di klien. Alasannya bukan kerapian:
 *
 * Versi lama merakitnya di komponen dari `NEXT_PUBLIC_WA_BUSINESS_NUMBER` —
 * variabel yang tidak pernah ada, karena env-nya bernama `WA_BUSINESS_NUMBER`.
 * Jadi nilainya selalu jatuh ke placeholder `6281234567890` yang di-hardcode
 * sebagai default, dan setiap pengguna diarahkan mengirim token pairing mereka
 * ke nomor milik orang lain. Nomor bisnis bukan rahasia, tapi token pairing
 * adalah kunci ke akun — dan default yang "kelihatan jalan" adalah cara
 * tercepat mengirimkannya ke alamat yang salah.
 *
 * Sekarang cuma ada satu sumber (`WA_BUSINESS_NUMBER`), dan kalau kosong
 * hasilnya `null` — bukan tautan yang salah.
 */

/** Sisakan digitnya saja: `wa.me` menolak `+`, spasi, dan tanda hubung. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * `null` bila nomornya belum dikonfigurasi. Pemanggil wajib menangani itu
 * dengan menampilkan keadaannya apa adanya, bukan tautan cadangan.
 */
export function buildWaUrl(businessNumber: string | undefined, token: string): string | null {
  const nomor = digitsOnly(businessNumber ?? '');
  // E.164 terpendek yang masuk akal ~8 digit; di bawah itu pasti salah isi.
  if (nomor.length < 8) return null;

  const pesan = `MULAI-${token.replace(/^MULAI-/, '')}`;
  return `https://wa.me/${nomor}?text=${encodeURIComponent(pesan)}`;
}
