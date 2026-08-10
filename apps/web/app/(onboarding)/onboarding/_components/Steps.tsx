'use client';

import { Button, Chip, GoalCard, type GoalValue, Slider, Stepper } from '@bodycoach/ui';
import type { ActivityLevel, Goal } from '@bodycoach/core';
import { useState } from 'react';

import type { BudgetPerMeal, FoodPreference, OnboardingState } from '../../../../lib/onboarding';

/**
 * Panel 10 langkah wizard onboarding.
 *
 * Setiap langkah memiliki:
 * - Judul layar (display).
 * - Subjudul opsional.
 * - Kontrol input spesifik.
 *
 * Komponen ini PRESENTASIONAL: state ada di parent. Fungsi `update`
 * dipanggil dengan pembaruan parsial, lalu parent memutuskan apakah
 * tombol "Lanjut" boleh aktif.
 */

interface StepsProps {
  readonly state: OnboardingState;
  readonly update: (patch: Partial<OnboardingState>) => void;
}

export function StepGoal({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Apa yang mau kamu capai?</h1>
      <div className="ob-step__list" role="radiogroup" aria-label="Pilih goal">
        <GoalCard
          value="bulk"
          title="BULK"
          description="Naikin berat & massa otot"
          icon={<span aria-hidden="true">💪</span>}
          selected={state.goal === 'bulk'}
          onSelect={(v: GoalValue) => update({ goal: v as Goal })}
        />
        <GoalCard
          value="cut"
          title="CUT"
          description="Turunin lemak, jaga otot"
          icon={<span aria-hidden="true">🔥</span>}
          selected={state.goal === 'cut'}
          onSelect={(v: GoalValue) => update({ goal: v as Goal })}
        />
        <GoalCard
          value="maintain"
          title="MAINTAIN"
          description="Pertahankan berat sekarang"
          icon={<span aria-hidden="true">⚖️</span>}
          selected={state.goal === 'maintain'}
          onSelect={(v: GoalValue) => update({ goal: v as Goal })}
        />
      </div>
    </div>
  );
}

export function StepSex({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Jenis kelamin kamu?</h1>
      <p className="ob-step__sub">Dipakai untuk menghitung kebutuhan kalori.</p>
      <div className="ob-step__grid">
        <button
          type="button"
          role="radio"
          aria-checked={state.sex === 'male'}
          className={`ob-gender${state.sex === 'male' ? ' ob-gender--selected' : ''}`}
          onClick={() => update({ sex: 'male' })}
        >
          <span className="ob-gender__icon" aria-hidden="true">
            👨
          </span>
          <span className="ob-gender__title">Pria</span>
          <span className="ob-gender__sub">Dipakai untuk menghitung kebutuhan kalori.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={state.sex === 'female'}
          className={`ob-gender${state.sex === 'female' ? ' ob-gender--selected' : ''}`}
          onClick={() => update({ sex: 'female' })}
        >
          <span className="ob-gender__icon" aria-hidden="true">
            👩
          </span>
          <span className="ob-gender__title">Wanita</span>
          <span className="ob-gender__sub">Dipakai untuk menghitung kebutuhan kalori.</span>
        </button>
      </div>
    </div>
  );
}

export function StepAge({ state, update }: StepsProps) {
  const currentYear = new Date().getFullYear();
  const age = state.birthYear !== null ? currentYear - state.birthYear : 25;
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Berapa umur kamu?</h1>
      <Stepper
        value={age}
        min={15}
        max={80}
        unit="tahun"
        ariaLabel="umur"
        onChange={(v) => update({ birthYear: currentYear - v })}
      />
    </div>
  );
}

export function StepHeight({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Berapa tinggi kamu?</h1>
      <div className="ob-step__slider">
        <div className="ob-step__slider-value">
          <span className="bc-num ob-step__slider-number">{state.heightCm ?? 170}</span>
          <span className="ob-step__slider-unit">cm</span>
        </div>
        <Slider
          min={120}
          max={220}
          value={state.heightCm ?? 170}
          onChange={(v) => update({ heightCm: v })}
          ariaLabel="Tinggi badan"
        />
        <div className="ob-step__slider-labels">
          <span>120 cm</span>
          <span>220 cm</span>
        </div>
      </div>
    </div>
  );
}

export function StepWeight({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Berat badan sekarang?</h1>
      <div className="ob-step__slider">
        <div className="ob-step__slider-value">
          <span className="bc-num ob-step__slider-number">
            {(state.weightKg ?? 70).toFixed(1).replace('.', ',')}
          </span>
          <span className="ob-step__slider-unit">kg</span>
        </div>
        <Slider
          min={30}
          max={200}
          step={0.1}
          decimal
          value={state.weightKg ?? 70}
          onChange={(v) => update({ weightKg: v })}
          ariaLabel="Berat badan"
        />
        <div className="ob-step__slider-labels">
          <span>30 kg</span>
          <span>200 kg</span>
        </div>
      </div>
    </div>
  );
}

export function StepTarget({ state, update }: StepsProps) {
  const w = state.weightKg ?? 70;
  const h = state.heightCm ?? 170;
  const t = state.targetWeightKg ?? w;
  const diff = t - w;
  const heightM = h / 100;
  const bmi = heightM > 0 ? t / (heightM * heightM) : 0;

  let hint: { text: string; tone: 'blue' | 'red' | 'none' } | null = null;
  if (bmi > 0 && bmi < 18.5) {
    hint = {
      text: 'Target BMI kamu di bawah 18,5. Kami akan tanya ulang di akhir.',
      tone: 'blue',
    };
  } else if (state.goal === 'bulk' && diff < 0) {
    hint = {
      text: 'Untuk BULK, target biasanya lebih tinggi dari berat sekarang.',
      tone: 'blue',
    };
  } else if (state.goal === 'cut' && diff > 0) {
    hint = {
      text: 'Untuk CUT, target biasanya lebih rendah dari berat sekarang.',
      tone: 'red',
    };
  } else if (state.goal) {
    hint = { text: 'Tarik slider untuk mengatur target berat.', tone: 'blue' };
  }

  const diffClass =
    diff > 0
      ? 'ob-journey__diff--positive'
      : diff < 0
        ? 'ob-journey__diff--negative'
        : 'ob-journey__diff--neutral';
  const diffText =
    diff === 0 ? '0 kg' : `${diff > 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')} kg`;

  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Berat target kamu?</h1>
      <div className="ob-journey">
        <div className="ob-journey__visual">
          <div className="ob-journey__point">
            <div className="ob-journey__label">Sekarang</div>
            <div className="bc-num ob-journey__weight">{w.toFixed(1).replace('.', ',')}</div>
          </div>
          <div className="ob-journey__arrow">
            <div className="ob-journey__line" />
            <div className={`ob-journey__diff ${diffClass}`}>{diffText}</div>
          </div>
          <div className="ob-journey__point">
            <div className="ob-journey__label">Target</div>
            <div className="bc-num ob-journey__weight">{t.toFixed(1).replace('.', ',')}</div>
          </div>
        </div>
        <Slider
          min={30}
          max={200}
          step={0.1}
          decimal
          value={t}
          onChange={(v) => update({ targetWeightKg: v })}
          ariaLabel="Berat target"
        />
        <div className="ob-step__slider-labels">
          <span>30 kg</span>
          <span>200 kg</span>
        </div>
        {hint ? (
          <div className="ob-journey__hint" data-tone={hint.tone === 'red' ? 'red' : 'blue'}>
            {hint.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; title: string; sub: string }[] = [
  { value: 'sedentary', title: 'Jarang gerak', sub: 'Kerja duduk seharian, jarang jalan kaki' },
  { value: 'light', title: 'Ringan', sub: 'Jalan kaki sesekali, kerja ringan' },
  { value: 'moderate', title: 'Sedang', sub: 'Banyak jalan, kerja yang melibatkan gerak' },
  { value: 'high', title: 'Aktif', sub: 'Sering berdiri, mengangkat barang berat' },
];

export function StepActivity({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Aktivitas harian di luar gym?</h1>
      <div className="ob-step__list" role="radiogroup" aria-label="Pilih aktivitas harian">
        {ACTIVITY_OPTIONS.map((opt) => (
          <button
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={state.activity === opt.value}
            className={`ob-activity${state.activity === opt.value ? ' ob-activity--selected' : ''}`}
            onClick={() => update({ activity: opt.value })}
          >
            <span className="ob-activity__dot" aria-hidden="true" />
            <span className="ob-activity__text">
              <span className="ob-activity__title">{opt.title}</span>
              <span className="ob-activity__sub">{opt.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const GYM_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7];

export function StepGym({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Berapa kali gym per minggu?</h1>
      <div className="ob-gym">
        <div className="ob-gym__scroll" role="radiogroup" aria-label="Pilih frekuensi gym">
          {GYM_OPTIONS.map((n) => (
            <Chip
              key={n}
              role="radio"
              value={String(n)}
              selected={state.gymPerWeek === n}
              onToggle={() => update({ gymPerWeek: n })}
            >
              {n}
            </Chip>
          ))}
        </div>
        <div className="ob-gym__caption">kali per minggu</div>
      </div>
    </div>
  );
}

const PREF_OPTIONS: { value: FoodPreference; label: string }[] = [
  { value: 'halal', label: 'Halal' },
  { value: 'no_pork', label: 'Tanpa babi' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'no_seafood', label: 'Tanpa seafood' },
  { value: 'no_dairy', label: 'Tanpa susu' },
  { value: 'none', label: 'Tidak ada pantangan' },
];

export function StepPreferences({ state, update }: StepsProps) {
  function toggle(pref: FoodPreference) {
    if (pref === 'none') {
      update({ preferences: ['none'] });
      return;
    }
    const without = state.preferences.filter((p) => p !== 'none');
    const has = without.includes(pref);
    update({
      preferences: has ? without.filter((p) => p !== pref) : [...without, pref],
    });
  }
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Preferensi makanan?</h1>
      <p className="ob-step__sub">Boleh pilih lebih dari satu.</p>
      <div className="ob-prefs" role="group" aria-label="Pilih preferensi makanan">
        {PREF_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            role="checkbox"
            value={opt.value}
            selected={state.preferences.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

const BUDGET_OPTIONS: { value: NonNullable<BudgetPerMeal>; label: string }[] = [
  { value: 'under_15k', label: '<15rb' },
  { value: '15_30k', label: '15–30rb' },
  { value: '30_50k', label: '30–50rb' },
  { value: 'over_50k', label: '>50rb' },
];

export function StepBudget({ state, update }: StepsProps) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Budget per makan?</h1>
      <p className="ob-step__sub">Supaya rekomendasi makanannya masuk akal. Opsional.</p>
      <div className="ob-budget" role="radiogroup" aria-label="Pilih budget per makan">
        {BUDGET_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            role="radio"
            value={opt.value}
            selected={state.budget === opt.value}
            onToggle={() => update({ budget: opt.value })}
          >
            {opt.label}
          </Chip>
        ))}
      </div>
      <button type="button" className="ob-budget__skip" onClick={() => update({ budget: null })}>
        Lewati
      </button>
    </div>
  );
}

export function StepAgreement({
  agreed,
  setAgreed,
}: {
  agreed: boolean;
  setAgreed: (v: boolean) => void;
}) {
  return (
    <div className="ob-step">
      <h1 className="ob-step__title">Sebelum lanjut…</h1>
      <div className="ob-agreement">
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          className={`ob-agreement__row${agreed ? ' ob-agreement__row--checked' : ''}`}
          onClick={() => setAgreed(!agreed)}
        >
          <span className="ob-agreement__box" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="ob-agreement__text">
            Saya setuju data tinggi, berat, dan kebiasaan makan saya diproses untuk membuat
            rekomendasi personal.{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>
              Kebijakan privasi
            </a>
            .
          </span>
        </button>
      </div>
    </div>
  );
}

/**
 * Layar calculating — animasi plat + teks berputar. Dipanggil saat submit
 * disetujui. Animasi menggunakan CSS keyframes di globals; selesai
 * mengarahkan ke halaman rencana atau guardrail.
 */
export function StepCalculating({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('Menghitung kebutuhan kalori…');
  const [progress, setProgress] = useState(0);

  useState(() => {
    const messages = [
      'Menghitung kebutuhan kalori…',
      'Menyusun target protein…',
      'Menyiapkan coach kamu…',
    ];
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setProgress(i);
      if (i < messages.length) {
        setText(messages[i] ?? messages[messages.length - 1] ?? '');
      }
    }, 700);
    const finish = setTimeout(() => {
      clearInterval(id);
      onDone();
    }, 2400);
    return () => {
      clearInterval(id);
      clearTimeout(finish);
    };
  });

  return (
    <div className="ob-calc">
      <div className="ob-calc__stack" aria-hidden="true">
        <div className="ob-calc__bar" />
        <div
          className={`ob-calc__plate ${progress >= 1 ? 'ob-calc__plate--loaded' : ''}`}
          style={{ left: 0, width: 50 }}
        />
        <div
          className={`ob-calc__plate ${progress >= 2 ? 'ob-calc__plate--loaded' : ''}`}
          style={{ left: 54, width: 35 }}
        />
        <div
          className={`ob-calc__plate ${progress >= 3 ? 'ob-calc__plate--loaded' : ''}`}
          style={{ left: 93, width: 45 }}
        />
        <div
          className={`ob-calc__plate ${progress >= 4 ? 'ob-calc__plate--loaded' : ''}`}
          style={{ left: 142, width: 40 }}
        />
      </div>
      <div className="ob-calc__text" aria-live="polite">
        {text}
      </div>
    </div>
  );
}

/**
 * Layar guardrail — TANPA angka apa pun. Dipanggil saat engine
 * mengembalikan `kind: 'block'`. Varian tombol "Ubah target" mengembalikan
 * ke langkah 6; "Pilih Maintain" memaksa goal menjadi maintain lalu submit
 * lagi (lihat handler di page).
 */
export function StepGuardrail({
  reason,
  onChangeTarget,
  onMaintain,
}: {
  reason: string;
  onChangeTarget: () => void;
  onMaintain: () => void;
}) {
  return (
    <div className="ob-guard">
      <div className="ob-guard__icon" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="ob-guard__title">{reason}</h1>
      <p className="ob-guard__body">
        Kami nggak bisa bikin rencana untuk target itu. Kalau kamu mau, kita bisa mulai dari menjaga
        berat sekarang — atau ngobrol dulu sama tenaga kesehatan.
      </p>
      <div className="ob-guard__btns">
        <Button onClick={onChangeTarget}>Ubah target</Button>
        <Button variant="secondary" onClick={onMaintain}>
          Pilih Maintain
        </Button>
      </div>
    </div>
  );
}
