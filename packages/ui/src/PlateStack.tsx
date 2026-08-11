'use client';

import { useEffect, useState } from 'react';

import { formatInt } from './format';

/**
 * Plate Stack — metafora inti sistem "Piring & Plat": kalori yang sudah masuk
 * digambarkan sebagai plat barbel yang dimuat satu per satu.
 *
 * Ada di dua tempat dengan dua ukuran (CLAUDE.md):
 * - `hero`      : plat tinggi 88px, lebar 18–35px, angka mono 44px di kanan.
 * - `dashboard` : plat 12x32px di atas track 8px. Menyusul di M8.
 *
 * Animasi `plateIn` 400ms dengan delay bertingkat 0/120/240/360ms. Di
 * `prefers-reduced-motion: reduce` plat langsung tampil tanpa transisi — bukan
 * animasi yang dipercepat, tapi tidak ada animasi sama sekali.
 */

export interface PlateStackProps {
  /** Kalori yang sudah tercatat hari ini. */
  readonly consumedKcal: number;
  /** Target kalori harian. */
  readonly targetKcal: number;
  /** Lebar tiap plat dalam px. Panjang array menentukan jumlah plat. */
  readonly plateWidths?: readonly number[];
}

const DEFAULT_WIDTHS = [28, 22, 35, 18] as const;
const STAGGER_MS = 120;

export function PlateStack({
  consumedKcal,
  targetKcal,
  plateWidths = DEFAULT_WIDTHS,
}: PlateStackProps) {
  const [loaded, setLoaded] = useState(false);
  const over = consumedKcal > targetKcal;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setLoaded(true);
      return;
    }
    // Satu frame jeda supaya state awal (opacity 0) sempat ter-render dan
    // transisinya benar-benar terlihat, bukan langsung melompat ke akhir.
    const id = window.setTimeout(() => setLoaded(true), 50);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="bc-plates" data-loaded={loaded || undefined}>
      <div className="bc-plates__bar" aria-hidden="true" />
      <div className="bc-plates__row" aria-hidden="true">
        {plateWidths.map((width, i) => (
          <div
            key={`${i}-${width}`}
            className={`bc-plates__plate${over ? ' bc-plates__plate--over' : ''}`}
            style={{ width, animationDelay: `${i * STAGGER_MS}ms` }}
          >
            P
          </div>
        ))}
      </div>
      <div className="bc-plates__label">
        <div className="bc-num bc-plates__number">{formatInt(consumedKcal)}</div>
        <div className="bc-num bc-plates__sub">dari {formatInt(targetKcal)} kkal</div>
      </div>
    </div>
  );
}
