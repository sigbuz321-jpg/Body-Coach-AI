/**
 * Helper format angka `id-ID`.
 *
 * Implementasinya pindah ke `@bodycoach/core` dan di-re-export dari sini.
 * Alasannya: angka yang sama muncul di web **dan** di balasan WhatsApp yang
 * dirakit worker, sedangkan worker tidak boleh mengimpor paket UI. Menyalin
 * fungsinya ke dua tempat persis melanggar aturan "semua angka lewat helper
 * format id-ID terpusat".
 *
 * File ini dipertahankan supaya komponen di paket ini tetap mengimpor dari
 * tetangganya, bukan menembus ke package lain di setiap berkas.
 */

export {
  formatDecimal2,
  formatEstimate,
  formatIdr,
  formatInt,
  formatKg,
  formatWeekRange,
  formatWeeklyRate,
  formatWeight,
} from '@bodycoach/core';
