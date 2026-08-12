import { buildCoachSystemPrompt, COACH_TOOLS, getAiProvider } from '@bodycoach/ai';

import type { CoachAnswer, CoachRunner } from './functions/message-received';

/**
 * `CoachRunner` nyata di atas provider aktif.
 *
 * Yang dirakit di sini cuma bentuk permintaannya. Bunyi prompt dan daftar tool
 * datang dari `coach.v1` — worker tidak boleh ikut menentukannya, karena
 * balasan lama harus tetap bisa dijelaskan oleh versi prompt yang
 * menghasilkannya.
 *
 * Satu putaran, bukan loop tool. Tool yang benar-benar dieksekusi worker hanya
 * `log_food` dan `escalate_concern`, dan keduanya menghentikan percakapan pada
 * putaran itu juga. Tool sisanya (`get_daily_status`, `lookup_food`, …) baru
 * masuk akal setelah ada loop, dan loop tanpa batas biaya adalah cara tercepat
 * membakar kuota — itu urusan M6.
 */

/** Balasan WhatsApp pendek. Batas ini juga menahan biaya per pesan. */
const MAX_TOKENS = 400;

/** Cukup variasi untuk terdengar manusiawi, tidak cukup untuk mengarang. */
const TEMPERATURE = 0.6;

export function createCoachRunner(): CoachRunner {
  return {
    async ask({ contextBlock, userText }): Promise<CoachAnswer> {
      const res = await getAiProvider().chat({
        messages: [
          { role: 'system', content: buildCoachSystemPrompt(contextBlock) },
          { role: 'user', content: userText },
        ],
        tools: COACH_TOOLS,
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });

      return {
        text: res.text.trim(),
        toolCalls: res.toolCalls.map((t) => ({ name: t.name, arguments: t.arguments })),
      };
    },
  };
}

/**
 * `null` bila provider belum bisa dipakai.
 *
 * Bukan lemparan: seluruh jalur deterministik — pairing, pencatatan makanan,
 * guardrail — tidak butuh AI sama sekali, dan mematikannya hanya karena
 * `AI_PROVIDER_KEY` kosong akan membuat produk tampak mati padahal delapan dari
 * sembilan cabangnya jalan.
 */
export function createCoachRunnerIfConfigured(): CoachRunner | null {
  try {
    getAiProvider();
    return createCoachRunner();
  } catch {
    return null;
  }
}
