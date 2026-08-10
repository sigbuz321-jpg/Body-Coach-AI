/**
 * @bodycoach/ai — providers/ dan prompts/.
 *
 * `src/providers/` adalah SATU-SATUNYA tempat SDK vendor AI boleh di-import
 * (docs/02-technical-spec.md §1). Prompt selalu file versioned (`coach.v1.ts`),
 * tidak pernah string inline.
 *
 * Isi menyusul di M5 (coach.v1) dan M7 (vision.v1).
 */

export const AI_PACKAGE = '@bodycoach/ai' as const;
