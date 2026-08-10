import type { KeyboardEvent, ReactNode } from 'react';

export type GoalValue = 'bulk' | 'cut' | 'maintain';

export interface GoalCardProps {
  readonly value: GoalValue;
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly selected: boolean;
  readonly onSelect: (value: GoalValue) => void;
}

/**
 * Kartu pilihan goal (BULK / CUT / MAINTAIN).
 *
 * Kontras antara terpilih/tidak harus terbaca dalam sekejap — itulah
 * satu-satunya cara pengguna bisa membedakan tiga opsi tanpa membaca label.
 *
 * - Terpilih  : border 2px warna goal, tint background, checkmark penuh.
 * - Tidak     : border `--border`, tanpa warna, transparan.
 *
 * Kontrol ini adalah satu radio (role="radio") dengan keyboard handler
 * yang menerima Enter/Space — fokus penuh ke navigasi keyboard.
 */
export function GoalCard({ value, title, description, icon, selected, onSelect }: GoalCardProps) {
  function activate() {
    onSelect(value);
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  }
  return (
    <div
      role="radio"
      tabIndex={0}
      aria-checked={selected}
      data-value={value}
      data-selected={selected || undefined}
      className={`bc-goal-card bc-goal-card--${value}${selected ? ' bc-goal-card--selected' : ''}`}
      onClick={activate}
      onKeyDown={onKey}
    >
      <span className="bc-goal-card__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="bc-goal-card__text">
        <div className="bc-goal-card__title">{title}</div>
        <div className="bc-goal-card__desc">{description}</div>
      </div>
      <span className="bc-goal-card__check" aria-hidden="true">
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
    </div>
  );
}
