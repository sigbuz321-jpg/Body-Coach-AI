/**
 * Bar horizontal untuk satu makro: Protein / Karbo / Lemak.
 *
 * - Track: 8px, radius pill, warna tint makro.
 * - Fill : warna solid makro. Lebar = value/target (dibatasi 100% visual,
 *   nilai sebenarnya tidak diklip agar teks bisa menunjukkan over-target).
 * - Teks di kanan: "98 / 140 g".
 *
 * Pemetaan warna final (Rencana): Protein hijau, Karbo kuning, Lemak biru.
 * Merah TIDAK dipakai untuk lemak karena merah sudah berarti "melewati target"
 * (CLAUDE.md konflik no. 1).
 */

import { formatInt } from './format';

export type MacroKey = 'protein' | 'carbs' | 'fat';

const MACRO_LABELS: Record<MacroKey, string> = {
  protein: 'Protein',
  carbs: 'Karbo',
  fat: 'Lemak',
};

const MACRO_TINTS: Record<MacroKey, string> = {
  protein: 'var(--plate-green-tint)',
  carbs: 'var(--plate-yellow-tint)',
  fat: 'var(--plate-blue-tint)',
};

const MACRO_FILLS: Record<MacroKey, string> = {
  protein: 'var(--plate-green)',
  carbs: 'var(--plate-yellow)',
  fat: 'var(--plate-blue)',
};

export interface MacroBarProps {
  readonly kind: MacroKey;
  readonly value: number;
  readonly target: number;
}

export function MacroBar({ kind, value, target }: MacroBarProps) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  const tint = MACRO_TINTS[kind];
  const fill = MACRO_FILLS[kind];
  return (
    <div className={`bc-macro bc-macro--${kind}`}>
      <div className="bc-macro__head">
        <div className="bc-macro__label">
          <span className="bc-macro__dot" style={{ background: fill }} aria-hidden="true" />
          <span>{MACRO_LABELS[kind]}</span>
        </div>
        <div className="bc-num bc-macro__value">
          <span style={{ color: 'var(--enamel-400)' }}>{formatInt(value)}</span>
          <span style={{ color: 'var(--enamel-300)' }}> / </span>
          <span>{formatInt(target)}</span>
          <span className="bc-macro__unit"> g</span>
        </div>
      </div>
      <div className="bc-macro__track" style={{ background: tint }}>
        <div className="bc-macro__fill" style={{ width: `${pct}%`, background: fill }} />
        {over ? (
          <div
            className="bc-macro__over"
            aria-hidden="true"
            style={{ left: '100%', background: 'var(--plate-red-tint)' }}
          />
        ) : null}
      </div>
    </div>
  );
}
