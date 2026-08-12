/**
 * @bodycoach/ai — providers/ dan prompts/.
 *
 * `src/providers/` adalah SATU-SATUNYA tempat SDK vendor AI boleh di-import
 * (docs/02-technical-spec.md §1). Prompt selalu file versioned (`coach.v1.ts`),
 * tidak pernah string inline.
 *
 * Provider aktif: MiniMax (`MiniMax-M3` untuk coach dan vision, `embo-01`
 * untuk embedding). Lihat `providers/minimax.ts`.
 */

export const AI_PACKAGE = '@bodycoach/ai' as const;

export {
  createMiniMaxProvider,
  EXPECTED_EMBEDDING_DIMENSIONS,
  stripReasoning,
} from './providers/minimax';
export type { MiniMaxOptions } from './providers/minimax';

export { AiProviderError } from './providers/types';
export type {
  AiProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatRole,
  ContentPart,
  EmbedResponse,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from './providers/types';

export { buildCoachSystemPrompt, COACH_PROMPT_VERSION, COACH_TOOLS } from './prompts/coach.v1';

export { getAiProvider, resetAiProvider } from './factory';
