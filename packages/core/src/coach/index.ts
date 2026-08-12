/**
 * Lapisan coach — domain murni.
 *
 * Perakit konteks, verifikasi angka (AD-1), dan deteksi kekhawatiran. Tidak
 * ada satu pun yang memanggil jaringan atau database: worker yang mengambil
 * datanya, modul ini yang memutuskan.
 */

export { buildUserContextBlock, mealSlotForHour, remaining } from './context';

export { blocksNumbers, concernReply, detectConcern } from './concern';
export type { ConcernMatch, ConcernSeverity } from './concern';

export {
  extractClaims,
  renderDeterministicTemplate,
  truthFromContext,
  verifyCoachNumbers,
} from './numbers';
export type { ClaimKind, NumberClaim, TruthSet, VerificationResult } from './numbers';

export {
  NEEDS_CHECK_BELOW,
  remainingAfter,
  renderFoodLogPreview,
  renderLogCancelled,
  renderLogConfirmed,
  renderNoFoodFound,
  renderNotLinked,
  renderPaired,
  renderPairFailure,
  renderPortionPrompt,
  renderWeightSaved,
  sumItems,
  truthForItems,
} from './reply';
export type { LoggedItemView, PairFailure } from './reply';

export { looksLikeQuestion } from './intent';
export { parseWeightMessage } from './weight';

export type { CoachContext, DailyTarget, DailyTotals, MealSlot, Remaining } from './types';
