/**
 * Harga langganan — satu-satunya sumber di seluruh kode.
 *
 * Ada di sini karena harga muncul di banyak tempat (landing, paywall,
 * balasan WhatsApp, invoice) dan pernah berbeda antar file desain:
 * `design/preview/colors-primary.html` menampilkan Rp79.000/bulan sementara
 * landing dan dashboard menampilkan Rp39.000. PRD menetapkan Rp39.000; angka
 * di colors-primary adalah sisa eksplorasi (lihat CLAUDE.md konflik no. 2).
 *
 * Nilai disimpan sebagai bilangan bulat rupiah, bukan string terformat —
 * format `id-ID` dilakukan di lapisan tampilan lewat helper terpusat.
 */

export const PRICING = {
  /** Paket gratis. Nol, tapi tetap dituliskan supaya layar tidak hardcode "Rp0". */
  freeIdr: 0,
  monthlyIdr: 39_000,
  yearlyIdr: 299_000,
} as const;

/**
 * Penghematan tahunan terhadap 12× harga bulanan, dibulatkan ke persen penuh.
 * Dihitung, tidak ditulis tangan: angka "Hemat 36%" di file desain akan salah
 * diam-diam begitu salah satu harga berubah.
 */
export function yearlySavingsPercent(): number {
  const twelveMonths = PRICING.monthlyIdr * 12;
  return Math.round(((twelveMonths - PRICING.yearlyIdr) / twelveMonths) * 100);
}

/** Harga bulanan efektif bila berlangganan tahunan. */
export function yearlyPerMonthIdr(): number {
  return Math.round(PRICING.yearlyIdr / 12);
}
