'use client';

import { Button, PlanCard, PlanExplainer } from '@bodycoach/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { OnboardingPlan } from '../../../lib/lastResult';
import { readLastResult } from '../../../lib/lastResult';

export default function RencanaPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlan(readLastResult()?.plan ?? null);
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="ob">
        <div className="ob-stage ob-stage--active" />
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="ob">
        <div className="ob-guard">
          <div className="ob-guard__icon" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="ob-guard__title">Belum ada rencana.</h1>
          <p className="ob-guard__body">
            Halaman ini hanya tersedia setelah kamu menyelesaikan onboarding.
          </p>
          <div className="ob-guard__btns">
            <Button onClick={() => router.push('/onboarding')}>Mulai onboarding</Button>
          </div>
        </div>
      </main>
    );
  }

  const timeline = estimateTimeline(plan);

  return (
    <main className="ob ob--plan">
      <div className="ob-plan__scroll">
        <PlanCard
          goal={plan.goal}
          currentWeightKg={plan.currentWeightKg}
          targetWeightKg={plan.targetWeightKg}
          kcal={plan.kcal}
          proteinG={plan.proteinG}
          carbsG={plan.carbsG}
          fatG={plan.fatG}
          timelineMinWeeks={timeline.min}
          timelineMaxWeeks={timeline.max}
          weeklyKg={plan.weeklyKg}
        />
        <PlanExplainer />
      </div>
      <div className="ob-nextbar ob-nextbar--stack">
        <Button onClick={() => router.push('/onboarding/sambungkan')}>Lanjut ke coach</Button>
        <Button variant="ghost" onClick={() => router.push('/onboarding')}>
          Ubah data saya
        </Button>
      </div>
    </main>
  );
}

function estimateTimeline(plan: OnboardingPlan): { min: number; max: number } {
  if (plan.goal === 'maintain') {
    return { min: 0, max: 0 };
  }
  const delta = Math.abs(plan.targetWeightKg - plan.currentWeightKg);
  const rate = Math.abs(plan.weeklyKg);
  if (rate === 0) return { min: 0, max: 0 };
  const weeks = delta / rate;
  return {
    min: Math.round(weeks * 0.85),
    max: Math.round(weeks * 1.35),
  };
}
