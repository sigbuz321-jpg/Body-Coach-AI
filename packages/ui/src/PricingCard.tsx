import type { ReactNode } from 'react';

import { formatIdr } from './format';

/**
 * Kartu harga. Dipakai landing (M4) dan halaman paywall (M9).
 *
 * `priceIdr` diterima sebagai angka, bukan string terformat — pemanggil
 * mengambilnya dari `PRICING` di `@bodycoach/core`, satu-satunya sumber harga
 * di kode ini. Tidak ada layar yang boleh menuliskan "Rp39.000" sendiri.
 */

export interface PricingCardProps {
  readonly name: string;
  readonly priceIdr: number;
  /** Mis. "/ bulan" atau "untuk selalu". */
  readonly period: string;
  readonly features: readonly string[];
  /** Badge kecil di tepi atas kartu. Hanya untuk kartu unggulan. */
  readonly badge?: string;
  /** Baris catatan di bawah harga, mis. penghematan tahunan. */
  readonly note?: ReactNode;
  readonly featured?: boolean;
  readonly cta: ReactNode;
}

export function PricingCard({
  name,
  priceIdr,
  period,
  features,
  badge,
  note,
  featured = false,
  cta,
}: PricingCardProps) {
  return (
    <div className={`bc-price${featured ? ' bc-price--featured' : ''}`}>
      {badge ? <div className="bc-price__badge">{badge}</div> : null}
      <div className="bc-price__name">{name}</div>
      <div className="bc-price__row">
        <span className="bc-num bc-price__amount">{formatIdr(priceIdr)}</span>
        <span className="bc-price__period">{period}</span>
      </div>
      {note ? <div className="bc-price__note">{note}</div> : null}
      <ul className="bc-price__features">
        {features.map((f) => (
          <li key={f} className="bc-price__feature">
            {f}
          </li>
        ))}
      </ul>
      <div className="bc-price__cta">{cta}</div>
    </div>
  );
}
