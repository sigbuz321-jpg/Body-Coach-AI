import { describe, expect, it } from 'vitest';

import {
  buildSubmitPayload,
  budgetToIdr,
  INITIAL_ONBOARDING_STATE,
  type OnboardingState,
} from './onboarding';

function filled(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    ...INITIAL_ONBOARDING_STATE,
    goal: 'bulk',
    sex: 'male',
    birthYear: 2000,
    heightCm: 170,
    weightKg: 70,
    targetWeightKg: 75,
    activity: 'moderate',
    gymPerWeek: 3,
    preferences: ['halal'],
    budget: '15_30k',
    displayName: null,
    ...overrides,
  };
}

describe('budgetToIdr', () => {
  it('null untuk tanpa preferensi', () => {
    expect(budgetToIdr(null)).toBeNull();
  });
  it('titik tengah rentang', () => {
    expect(budgetToIdr('under_15k')).toBe(15_000);
    expect(budgetToIdr('15_30k')).toBe(22_500);
    expect(budgetToIdr('30_50k')).toBe(40_000);
    expect(budgetToIdr('over_50k')).toBe(55_000);
  });
});

describe('buildSubmitPayload', () => {
  it('mengembalikan null bila field wajib masih kosong', () => {
    expect(buildSubmitPayload(INITIAL_ONBOARDING_STATE, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), goal: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), sex: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), birthYear: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), heightCm: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), weightKg: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), targetWeightKg: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), activity: null }, true)).toBeNull();
    expect(buildSubmitPayload({ ...filled(), gymPerWeek: null }, true)).toBeNull();
  });

  it('mengembalikan null bila consent data kesehatan belum dicentang', () => {
    expect(buildSubmitPayload(filled(), false)).toBeNull();
  });

  it('membangun payload lengkap dengan budget IDR', () => {
    const payload = buildSubmitPayload(filled(), true);
    expect(payload).not.toBeNull();
    expect(payload?.budgetPerMealIdr).toBe(22_500);
    expect(payload?.goal).toBe('bulk');
    expect(payload?.preferences).toEqual(['halal']);
    expect(payload?.consentHealthData).toBe(true);
  });

  it('meneruskan budget null bila user lewati', () => {
    const payload = buildSubmitPayload(filled({ budget: null }), true);
    expect(payload?.budgetPerMealIdr).toBeNull();
  });

  it('mempertahankan displayName jika diisi', () => {
    const payload = buildSubmitPayload(filled({ displayName: 'Daffa' }), true);
    expect(payload?.displayName).toBe('Daffa');
  });
});
