import {
  buildCoachSystemPrompt,
  COACH_TOOLS,
  getAiProvider,
  type ChatMessage,
} from '@bodycoach/ai';

import type { CoachAnswer, CoachRunner, CoachTurn } from './functions/message-received';

/**
 * `CoachRunner` nyata di atas provider aktif.
 *
 * Yang dirakit di sini cuma bentuk permintaannya. Bunyi prompt dan daftar tool
 * datang dari `coach.v1` — worker tidak boleh ikut menentukannya, karena
 * balasan lama harus tetap bisa dijelaskan oleh versi prompt yang
 * menghasilkannya.
 *
 * Tanpa status: setiap panggilan membawa seluruh giliran percakapan yang
 * relevan. Yang menyimpan dan membatasi giliran adalah pemanggil
 * (`jawabPertanyaan`), bukan file ini, supaya batas putaran dan batas biaya
 * hidup di satu tempat bersama keputusan lainnya.
 */

/**
 * Balasan WhatsApp pendek — tapi `MiniMax-M3` adalah model penalar dan
 * monolognya ikut menghabiskan jatah ini. Diverifikasi 13 Agustus: dengan 400,
 * satu putaran habis 151–184 token dan balasan sering terpotong sebelum
 * kalimatnya keluar. 1.024 memberi ruang untuk berpikir lalu menjawab, dan
 * tetap jauh di bawah batas panjang pesan WhatsApp.
 */
const MAX_TOKENS = 1024;

/** Cukup variasi untuk terdengar manusiawi, tidak cukup untuk mengarang. */
const TEMPERATURE = 0.6;

function toChatMessage(turn: CoachTurn): ChatMessage {
  if (turn.role === 'tool') {
    return { role: 'tool', content: turn.content, toolCallId: turn.toolCallId ?? '' };
  }
  if (turn.role === 'assistant' && turn.toolCalls && turn.toolCalls.length > 0) {
    return { role: 'assistant', content: turn.content, toolCalls: turn.toolCalls };
  }
  return { role: turn.role, content: turn.content };
}

export function createCoachRunner(): CoachRunner {
  return {
    async ask({ contextBlock, turns }): Promise<CoachAnswer> {
      const res = await getAiProvider().chat({
        messages: [
          { role: 'system', content: buildCoachSystemPrompt(contextBlock) },
          ...turns.map(toChatMessage),
        ],
        tools: COACH_TOOLS,
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      });

      return {
        text: res.text.trim(),
        // `id` dibawa apa adanya: putaran berikutnya harus menautkan hasil tool
        // ke permintaan aslinya, dan id itu milik vendor.
        toolCalls: res.toolCalls.map((t) => ({
          id: t.id,
          name: t.name,
          arguments: t.arguments,
        })),
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
