'use client';

import { Button, PlanCard, PlanExplainer } from '@bodycoach/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { OnboardingPlan } from '../../../lib/lastResult';
import { readLastResult } from '../../../lib/lastResult';
import { ROUTES } from '../../../lib/routes';

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
            <Button onClick={() => router.push(ROUTES.onboarding)}>Mulai onboarding</Button>
          </div>
        </div>
      </main>
    );
  }

  // Perkiraan durasi datang dari engine lewat respons API (AD-1). Halaman ini
  // tidak menghitung ulang apa pun — versi lokal yang pernah ada di sini
  // mengembalikan 0 untuk maintain, dan PlanCard merendernya "0 minggu".
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
          timelineMinWeeks={plan.timeline?.minWeeks ?? null}
          timelineMaxWeeks={plan.timeline?.maxWeeks ?? null}
          weeklyKg={plan.weeklyKg}
        />
        <PlanExplainer />
      </div>
      <div className="ob-nextbar ob-nextbar--stack">
        <Button onClick={() => router.push(ROUTES.sambungkan)}>Lanjut ke coach</Button>
        <Button variant="ghost" onClick={() => router.push(ROUTES.onboarding)}>
          Ubah data saya
        </Button>
      </div>
    </main>
  );
}
