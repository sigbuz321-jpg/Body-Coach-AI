'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { track } from '../../../lib/analytics';
import { ROUTES } from '../../../lib/routes';

/**
 * Tautan CTA landing. Setiap CTA menuju `/onboarding` dan memicu
 * `landing.cta_clicked` dengan properti `placement` supaya bisa dibedakan
 * mana yang benar-benar dipakai orang: nav, hero, harga, atau bilah bawah.
 *
 * [DEVIASI] File desain mengarahkan semua CTA ke `#harga` (anchor internal).
 * DoD M4 menetapkan CTA "Mulai gratis" menuju `/onboarding` — pengguna yang
 * sudah memutuskan tidak perlu dipaksa lewat tabel harga dulu. Tautan
 * sekunder "Lihat cara kerjanya" tetap anchor internal.
 */

export type CtaPlacement = 'nav' | 'hero' | 'pricing_free' | 'pricing_pro' | 'mobile_bar';

export interface CtaProps {
  readonly placement: CtaPlacement;
  readonly className: string;
  readonly children: React.ReactNode;
}

export function Cta({ placement, className, children }: CtaProps) {
  return (
    <Link
      href={ROUTES.onboarding}
      className={className}
      onClick={() => track('landing.cta_clicked', { placement })}
    >
      {children}
    </Link>
  );
}

/** Memicu `landing.viewed` sekali saat halaman dibuka. */
export function LandingViewed() {
  useEffect(() => {
    track('landing.viewed');
  }, []);
  return null;
}
