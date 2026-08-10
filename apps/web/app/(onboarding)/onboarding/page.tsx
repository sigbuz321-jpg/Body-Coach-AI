'use client';

import { Button, ProgressBar } from '@bodycoach/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  buildSubmitPayload,
  INITIAL_ONBOARDING_STATE,
  SESSION_KEY,
  type OnboardingState,
  type OnboardingSubmitPayload,
} from '../../../lib/onboarding';
import { useSessionState } from '../../../lib/useSessionState';
import {
  StepActivity,
  StepAge,
  StepAgreement,
  StepBudget,
  StepCalculating,
  StepGym,
  StepGoal,
  StepGuardrail,
  StepHeight,
  StepPreferences,
  StepSex,
  StepTarget,
  StepWeight,
} from './_components/Steps';

const TOTAL_STEPS = 10;

type Stage =
  | { kind: 'wizard'; step: number }
  | { kind: 'agreement' }
  | { kind: 'submitting' }
  | { kind: 'guardrail'; reason: string }
  | { kind: 'error'; message: string };

function isStepComplete(step: number, state: OnboardingState): boolean {
  switch (step) {
    case 1:
      return state.goal !== null;
    case 2:
      return state.sex !== null;
    case 3:
      return state.birthYear !== null;
    case 4:
      return state.heightCm !== null;
    case 5:
      return state.weightKg !== null;
    case 6:
      return state.targetWeightKg !== null;
    case 7:
      return state.activity !== null;
    case 8:
      return state.gymPerWeek !== null;
    case 9:
      return state.preferences.length > 0;
    case 10:
      return true;
    default:
      return false;
  }
}

function buildPayload(state: OnboardingState): OnboardingSubmitPayload | null {
  return buildSubmitPayload(state);
}

/**
 * Pemetaan BlockReason engine ke judul layar guardrail.
 * Salinan ditampilkan apa adanya (Bahasa Indonesia) sesuai desain.
 */
const GUARDRAIL_TITLE: Record<string, string> = {
  cut_underweight: 'Target ini di bawah rentang berat sehat.',
  target_underweight: 'Target ini di bawah rentang berat sehat.',
  goal_mismatch: 'Arah goal kamu nggak cocok dengan target.',
};

export default function OnboardingPage() {
  const router = useRouter();
  const {
    value: state,
    set: setState,
    hydrated,
  } = useSessionState<OnboardingState>(SESSION_KEY, INITIAL_ONBOARDING_STATE);
  const [stage, setStage] = useState<Stage>({ kind: 'wizard', step: 1 });
  const [agreed, setAgreed] = useState(false);

  // Setelah hidrasi, kalau user ada di langkah > 1, kembali ke langkah 1.
  // Ini mencegah URL panjang dan inkonsistensi.
  useEffect(() => {
    if (!hydrated) return;
    if (stage.kind !== 'wizard') return;
    // Tidak ada efek — initial step adalah 1.
  }, [hydrated, stage.kind]);

  const currentStep = stage.kind === 'wizard' ? stage.step : TOTAL_STEPS;
  const canAdvance =
    stage.kind === 'wizard'
      ? isStepComplete(currentStep, state)
      : stage.kind === 'agreement'
        ? agreed
        : false;

  const update = useCallback(
    (patch: Partial<OnboardingState>) => {
      setState((prev) => ({ ...prev, ...patch }));
    },
    [setState],
  );

  function next() {
    if (stage.kind === 'wizard') {
      if (!isStepComplete(stage.step, state)) return;
      if (stage.step === TOTAL_STEPS) {
        setStage({ kind: 'agreement' });
        return;
      }
      setStage({ kind: 'wizard', step: stage.step + 1 });
      return;
    }
    if (stage.kind === 'agreement') {
      void submit();
    }
  }

  function back() {
    if (stage.kind === 'agreement') {
      setStage({ kind: 'wizard', step: TOTAL_STEPS });
      return;
    }
    if (stage.kind === 'wizard' && stage.step > 1) {
      setStage({ kind: 'wizard', step: stage.step - 1 });
    }
  }

  async function submit() {
    const payload = buildPayload(state);
    if (!payload) {
      setStage({ kind: 'error', message: 'Data belum lengkap. Coba ulangi dari awal.' });
      return;
    }
    setStage({ kind: 'submitting' });
    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as
        | { kind: 'ready'; plan: unknown; linkToken: string }
        | { kind: 'blocked'; reason: string }
        | { error: string };
      if (!res.ok || 'error' in json) {
        setStage({
          kind: 'error',
          message: 'error' in json ? json.error : `HTTP ${res.status}`,
        });
        return;
      }
      if (json.kind === 'blocked') {
        const title = GUARDRAIL_TITLE[json.reason] ?? 'Target ini di bawah rentang berat sehat.';
        setStage({ kind: 'guardrail', reason: title });
        return;
      }
      // Sukses: bersihkan session dan arahkan ke rencana.
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // Abaikan.
      }
      try {
        window.sessionStorage.setItem(
          'bodycoach.lastResult.v1',
          JSON.stringify({ plan: json.plan, linkToken: json.linkToken }),
        );
      } catch {
        // Abaikan.
      }
      router.push('/onboarding/rencana');
    } catch (err) {
      setStage({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Tidak bisa terhubung ke server.',
      });
    }
  }

  function onChangeTarget() {
    setStage({ kind: 'wizard', step: 6 });
  }

  function onChooseMaintain() {
    update({ goal: 'maintain', targetWeightKg: state.weightKg ?? state.targetWeightKg ?? 70 });
    setStage({ kind: 'submitting' });
    // Hindari duplikasi submit — panggil submit langsung setelah state.
    setTimeout(() => {
      void submit();
    }, 0);
  }

  const showProgress = stage.kind === 'wizard';
  const showBack = (stage.kind === 'wizard' && stage.step > 1) || stage.kind === 'agreement';
  const showNext = stage.kind === 'wizard' || stage.kind === 'agreement';

  return (
    <main className="ob">
      {showProgress ? (
        <ProgressBar
          current={currentStep}
          total={TOTAL_STEPS}
          label={`${currentStep} dari ${TOTAL_STEPS}`}
        />
      ) : null}
      {showBack ? (
        <button type="button" className="ob-back" onClick={back} aria-label="Kembali">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : null}

      <div className="ob-stages">
        {stage.kind === 'wizard' ? (
          <div className="ob-stage ob-stage--active" key={`wizard-${stage.step}`}>
            {stage.step === 1 ? <StepGoal state={state} update={update} /> : null}
            {stage.step === 2 ? <StepSex state={state} update={update} /> : null}
            {stage.step === 3 ? <StepAge state={state} update={update} /> : null}
            {stage.step === 4 ? <StepHeight state={state} update={update} /> : null}
            {stage.step === 5 ? <StepWeight state={state} update={update} /> : null}
            {stage.step === 6 ? <StepTarget state={state} update={update} /> : null}
            {stage.step === 7 ? <StepActivity state={state} update={update} /> : null}
            {stage.step === 8 ? <StepGym state={state} update={update} /> : null}
            {stage.step === 9 ? <StepPreferences state={state} update={update} /> : null}
            {stage.step === 10 ? <StepBudget state={state} update={update} /> : null}
          </div>
        ) : null}

        {stage.kind === 'agreement' ? (
          <div className="ob-stage ob-stage--active" key="agreement">
            <StepAgreement agreed={agreed} setAgreed={setAgreed} />
          </div>
        ) : null}

        {stage.kind === 'submitting' ? (
          <div className="ob-stage ob-stage--active" key="submitting">
            <StepCalculating onDone={() => undefined} />
          </div>
        ) : null}

        {stage.kind === 'guardrail' ? (
          <div className="ob-stage ob-stage--active" key="guardrail">
            <StepGuardrail
              reason={stage.reason}
              onChangeTarget={onChangeTarget}
              onMaintain={onChooseMaintain}
            />
          </div>
        ) : null}

        {stage.kind === 'error' ? (
          <div className="ob-stage ob-stage--active" key="error">
            <div className="ob-guard">
              <div className="ob-guard__icon" aria-hidden="true">
                ⚠️
              </div>
              <h1 className="ob-guard__title">Ada masalah.</h1>
              <p className="ob-guard__body">{stage.message}</p>
              <div className="ob-guard__btns">
                <Button onClick={() => setStage({ kind: 'wizard', step: 1 })}>Coba lagi</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showNext ? (
        <div className="ob-nextbar">
          <Button onClick={next} disabled={!canAdvance}>
            {stage.kind === 'agreement' ? 'Buat rencana saya' : 'Lanjut'}
          </Button>
        </div>
      ) : null}
    </main>
  );
}
