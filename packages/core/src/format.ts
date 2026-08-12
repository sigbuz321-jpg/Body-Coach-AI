/**
 * Helper format angka untuk tampilan Bahasa Indonesia.
 *
 * Selalu pakai Intl.NumberFormat('id-ID'): ribuan pakai titik (`1.830`),
 * desimal pakai koma (`63,4`). Estimasi selalu diawali `±`.
 *
 * Dilarang memakai toFixed manual atau template string biasa — itu yang
 * dahulu merusak konsistensi angka di produk.
 */

const intWhole = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
});

const intDecimal1 = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const intDecimal2 = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Bilangan bulat dengan pemisah ribuan. `1234 -> "1.234"`. */
export function formatInt(n: number): string {
  return intWhole.format(n);
}

/** Satu desimal, selalu ditampilkan. `63.4 -> "63,4"`. */
export function formatKg(n: number): string {
  return intDecimal1.format(n);
}

/** Dua desimal. Untuk BMI dan persen. */
export function formatDecimal2(n: number): string {
  return intDecimal2.format(n);
}

/** Estimasi: `±720 kkal`. */
export function formatEstimate(n: number, unit: string): string {
  return `±${intWhole.format(n)} ${unit}`;
}

/**
 * Rentang minggu sebagai "X–Y minggu" — dipakai di kartu rencana.
 * Kalau min == max, tampilkan satu angka.
 */
export function formatWeekRange(min: number, max: number): string {
  if (min === max) return `${intWhole.format(min)} minggu`;
  return `${intWhole.format(min)}–${intWhole.format(max)} minggu`;
}

/** Laju perubahan berat: `+0,22 kg/minggu` atau `−0,45 kg/minggu`. */
export function formatWeeklyRate(rateKg: number): string {
  const sign = rateKg > 0 ? '+' : rateKg < 0 ? '−' : '';
  return `${sign}${intDecimal2.format(Math.abs(rateKg))} kg/minggu`;
}

/**
 * Rupiah tanpa desimal: `39000 -> "Rp39.000"`, `0 -> "Rp0"`.
 *
 * Tanpa spasi setelah "Rp" — mengikuti penulisan di landing dan dashboard.
 * `Intl` dengan `currency: 'IDR'` menghasilkan "Rp 39.000" (dengan NBSP) di
 * sebagian runtime dan "IDR 39.000" di sebagian lain, jadi simbolnya
 * ditempelkan sendiri di atas pemformatan angka biasa.
 */
export function formatIdr(amount: number): string {
  return `Rp${intWhole.format(amount)}`;
}

/** Berat sebagai "63,4 kg". */
export function formatWeight(kg: number): string {
  return `${intDecimal1.format(kg)} kg`;
}

/**
 * Gram porsi: `150 g`, `187,5 g`.
 *
 * Desimal hanya ditampilkan kalau memang ada — "setengah porsi nasi padang"
 * menghasilkan 175 g, tapi setengah porsi 125 g menghasilkan 62,5 g, dan
 * membulatkannya diam-diam membuat angka porsi tidak cocok dengan kalorinya.
 */
export function formatGrams(g: number): string {
  return `${Number.isInteger(g) ? intWhole.format(g) : intDecimal1.format(g)} g`;
}
