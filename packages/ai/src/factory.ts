import { createMiniMaxProvider } from './providers/minimax';
import { AiProviderError, type AiProvider } from './providers/types';

/**
 * Pemilihan provider dari environment.
 *
 * Dibaca malas dan di-cache: mengimpor package ini tidak boleh meledak hanya
 * karena `AI_PROVIDER_KEY` belum diisi — landing page dan onboarding tidak
 * membutuhkan AI sama sekali, dan keduanya di-build oleh proses yang sama.
 *
 * Env yang dipakai (docs/02-technical-spec.md §2):
 * - `AI_PROVIDER_KEY`    kunci API MiniMax
 * - `AI_COACH_MODEL`     default `MiniMax-M3`
 * - `AI_VISION_MODEL`    default `MiniMax-M3` (model yang sama menerima gambar)
 * - `AI_EMBEDDING_MODEL` default `embo-01`
 */

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const apiKey = process.env['AI_PROVIDER_KEY'] ?? '';
  if (!apiKey) {
    throw new AiProviderError(
      'AI_PROVIDER_KEY belum diisi di .env.local — coach dan analisis foto tidak bisa jalan.',
      0,
      false,
      'minimax',
    );
  }

  const chatModel = process.env['AI_COACH_MODEL'];
  const embedModel = process.env['AI_EMBEDDING_MODEL'];

  cached = createMiniMaxProvider({
    apiKey,
    ...(chatModel ? { chatModel } : {}),
    ...(embedModel ? { embedModel } : {}),
  });
  return cached;
}

/** Membuang cache. Dipakai test dan saat env berubah di dev. */
export function resetAiProvider(): void {
  cached = null;
}
