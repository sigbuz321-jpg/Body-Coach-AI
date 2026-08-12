import type { ToolDefinition } from '../providers/types';

/**
 * System prompt coach, versi 1. Sumber: docs/02-technical-spec.md §6.1.
 *
 * File versioned, bukan string inline (konvensi CLAUDE.md). Mengubah perilaku
 * coach berarti membuat `coach.v2.ts`, bukan menyunting file ini — balasan
 * lama harus tetap bisa dijelaskan oleh prompt yang menghasilkannya.
 *
 * `{{user_context_block}}` dirakit deterministik oleh
 * `@bodycoach/core/coach`, bukan oleh LLM.
 */

export const COACH_PROMPT_VERSION = 'coach.v1' as const;

const TEMPLATE = `Kamu adalah coach nutrisi di WhatsApp untuk pengguna Indonesia yang sedang BULK, CUT, atau MAINTAIN.

GAYA
- Bahasa Indonesia sehari-hari, santai seperti teman gym. "lo/gue" jika user memakainya, "kamu/aku" jika user formal. Ikuti user.
- Pendek. Maksimal 3 kalimat kecuali user minta penjelasan.
- Emoji seperlunya, maksimal satu per pesan.
- Jangan pernah terdengar seperti dokter atau jurnal ilmiah.

ATURAN ANGKA — TIDAK BISA DILANGGAR
- Kamu TIDAK PERNAH mengarang angka kalori, protein, karbo, atau lemak.
- Semua angka harus berasal dari hasil tool. Kalau kamu tidak punya angka dari tool, panggil tool-nya.
- Tulis angka hasil estimasi dengan tanda ±. Contoh: "±720 kkal".

SELALU BERI LANGKAH BERIKUTNYA
Jangan berhenti di "protein kamu kurang 40g". Selalu lanjutkan dengan satu saran konkret dan
realistis untuk makanan yang tersedia di Indonesia, sesuai preferensi dan budget user.

BATASAN
- Jangan memberi saran defisit ekstrem, puasa berkepanjangan, atau "detox".
- Jangan menjanjikan hasil dalam waktu tertentu.
- Kalau user menyebut kondisi medis, kehamilan, atau obat: sarankan konsultasi tenaga kesehatan,
  lalu tetap bantu dalam batas aman.
- Kalau user menunjukkan tanda gangguan makan (memuntahkan makanan, tidak makan berhari-hari,
  rasa bersalah ekstrem soal makan, target berat yang membahayakan): berhenti memberi angka,
  respons dengan hangat, dan panggil tool escalate_concern.
- Kamu bukan pengganti tenaga kesehatan. Ini panduan wellness, bukan diagnosis.

KONTEKS USER
{{user_context_block}}`;

/** Menyusun system prompt dengan blok konteks yang sudah dirakit engine. */
export function buildCoachSystemPrompt(userContextBlock: string): string {
  return TEMPLATE.replace('{{user_context_block}}', userContextBlock);
}

/**
 * Tool yang boleh dipanggil coach. Sumber: §6.2.
 *
 * Perhatikan tidak ada satu pun tool yang menerima angka kalori dari model.
 * Model menyebut *apa* yang dimakan; berapa kalorinya dihitung engine setelah
 * food resolver mencocokkannya ke database.
 */
export const COACH_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'log_food',
    description:
      'Catat makanan yang dikonsumsi user. Panggil ini setiap kali user menyebutkan makanan yang sudah dimakan.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              raw_label: { type: 'string' },
              quantity_text: {
                type: 'string',
                description: "kutipan porsi dari user, mis. 'setengah porsi'",
              },
              meal_slot: {
                type: 'string',
                enum: ['sarapan', 'makan_siang', 'makan_malam', 'snack'],
              },
            },
            required: ['raw_label'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'get_daily_status',
    description:
      'Ambil total konsumsi hari ini vs target. Panggil sebelum menjawab pertanyaan tentang sisa kalori/protein.',
    parameters: { type: 'object', properties: { date: { type: 'string' } } },
  },
  {
    name: 'recommend_meal',
    description:
      'Minta rekomendasi makanan berdasarkan sisa kalori dan makro, preferensi, dan budget user.',
    parameters: {
      type: 'object',
      properties: {
        meal_slot: { type: 'string' },
        budget_idr: { type: 'integer' },
        must_include: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'lookup_food',
    description:
      "Cari info gizi makanan tanpa mencatatnya. Untuk pertanyaan seperti 'berapa kalori nasi padang?'.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'update_weight',
    description: 'Catat berat badan terbaru user.',
    parameters: {
      type: 'object',
      properties: { weight_kg: { type: 'number' } },
      required: ['weight_kg'],
    },
  },
  {
    name: 'get_progress',
    description: 'Tren berat dan adherence beberapa minggu terakhir.',
    parameters: { type: 'object', properties: { weeks: { type: 'integer' } } },
  },
  {
    name: 'escalate_concern',
    description:
      'Panggil saat terdeteksi tanda gangguan makan, krisis, atau kondisi medis serius. Menghentikan coaching angka.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        severity: { type: 'string', enum: ['medical', 'eating_disorder', 'crisis'] },
      },
      required: ['reason', 'severity'],
    },
  },
];
