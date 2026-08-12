/**
 * Template pesan WhatsApp yang harus diajukan ke Meta.
 *
 * Kenapa template sama sekali: di luar jendela 24 jam sejak pesan terakhir
 * pengguna, Meta hanya mengizinkan pesan berbasis template yang sudah
 * disetujui. Semua pesan terjadwal (§8) jatuh di luar jendela itu.
 *
 * Isi di sini adalah **sumber pengajuan**: teks yang didaftarkan di Meta
 * Business Manager harus sama persis dengan `body` di bawah, termasuk posisi
 * `{{n}}`. Kalau berbeda, pengiriman gagal dengan error yang menyebut
 * parameter tidak cocok, bukan teks tidak cocok.
 *
 * Status pengajuan dilacak di PLAN.md — sampai keempatnya `APPROVED`, job
 * terjadwal hanya bisa mengirim ke pengguna yang aktif dalam 24 jam terakhir.
 */

export type TemplateName =
  'ringkasan_harian' | 'laporan_mingguan' | 'pengingat_timbang' | 'target_disesuaikan';

export interface TemplateDefinition {
  readonly name: TemplateName;
  /** Kategori Meta. Semua di sini UTILITY, bukan MARKETING. */
  readonly category: 'UTILITY';
  readonly language: 'id';
  /** Teks persis untuk diajukan. `{{1}}`, `{{2}}`, ... sesuai urutan `params`. */
  readonly body: string;
  /** Nama parameter berurutan — dokumentasi, bukan dikirim ke Meta. */
  readonly params: readonly string[];
}

export const TEMPLATES: Record<TemplateName, TemplateDefinition> = {
  ringkasan_harian: {
    name: 'ringkasan_harian',
    category: 'UTILITY',
    language: 'id',
    body: 'Rekap hari ini: {{1}} kkal dari target {{2}} kkal, protein {{3}}g. {{4}}',
    params: ['kkal_masuk', 'kkal_target', 'protein_masuk', 'saran_penutup'],
  },
  laporan_mingguan: {
    name: 'laporan_mingguan',
    category: 'UTILITY',
    language: 'id',
    body: 'Laporan minggu ini: rata-rata {{1}} kkal per hari, tercatat {{2}} hari. Berat {{3}}. Fokus minggu depan: {{4}}',
    params: ['rata_kkal', 'hari_tercatat', 'tren_berat', 'fokus'],
  },
  pengingat_timbang: {
    name: 'pengingat_timbang',
    category: 'UTILITY',
    language: 'id',
    body: 'Udah {{1}} hari belum timbang. Kirim angkanya ke sini ya, biar target kamu tetap pas.',
    params: ['hari_sejak_timbang'],
  },
  target_disesuaikan: {
    name: 'target_disesuaikan',
    category: 'UTILITY',
    language: 'id',
    body: 'Target kamu disesuaikan jadi {{1}} kkal per hari (protein {{2}}g). Alasannya: {{3}}',
    params: ['kkal_baru', 'protein_baru', 'alasan'],
  },
};

/** Payload Graph API untuk mengirim template. */
export function buildTemplateMessage(
  to: string,
  name: TemplateName,
  params: readonly string[],
): Record<string, unknown> {
  const def = TEMPLATES[name];
  if (params.length !== def.params.length) {
    throw new Error(
      `template ${name} butuh ${def.params.length} parameter (${def.params.join(', ')}), diberi ${params.length}`,
    );
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name,
      language: { code: def.language },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text })),
        },
      ],
    },
  };
}
