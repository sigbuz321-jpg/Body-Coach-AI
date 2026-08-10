import type { KeyboardEvent, ReactNode } from 'react';

export interface ChipProps {
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  /** Apakah ini radio (single-select) atau checkbox (multi-select). */
  readonly role?: 'radio' | 'checkbox';
  readonly value?: string;
}

/**
 * Chip serbaguna: bisa jadi radio (frekuensi gym) atau checkbox (preferensi).
 *
 * Dipakai di banyak langkah onboarding. Tinggi 48px, border 2px, pill.
 * Tidak mengikuti button scheme — chip adalah pilihan, bukan aksi final.
 */
export function Chip({ selected, onToggle, children, role = 'checkbox', value }: ChipProps) {
  function activate() {
    onToggle();
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  }
  return (
    <div
      role={role}
      tabIndex={0}
      aria-checked={selected}
      data-value={value}
      data-selected={selected || undefined}
      className={`bc-chip${selected ? ' bc-chip--selected' : ''}`}
      onClick={activate}
      onKeyDown={onKey}
    >
      {children}
    </div>
  );
}
