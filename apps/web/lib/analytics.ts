'use client';

/**
 * Pelacakan event produk.
 *
 * Nama event mengikuti konvensi `noun.verb` dan daftar di
 * `docs/01-system-design.md` §11. Tipe union di bawah sengaja tertutup: event
 * baru harus ditambahkan ke daftar itu dulu, bukan diketik bebas di tempat
 * pemakaian.
 *
 * PostHog belum dipasang (menyusul bersama instrumentasi penuh). Sampai itu
 * terjadi, `track` adalah no-op yang aman: ia mengirim ke `window.posthog`
 * kalau ada, dan diam kalau tidak. Yang penting sekarang adalah call site-nya
 * sudah benar dan tidak ada properti PII yang ikut terkirim.
 */

export type AnalyticsEvent =
  | 'landing.viewed'
  | 'landing.cta_clicked'
  | 'onboarding.started'
  | 'onboarding.step_completed'
  | 'onboarding.completed'
  | 'plan.viewed'
  | 'whatsapp.linked'
  | 'paywall.viewed';

/** Properti event: skalar saja. Tidak ada objek, tidak ada PII. */
export type AnalyticsProps = Readonly<Record<string, string | number | boolean>>;

interface PostHogLike {
  capture: (event: string, props?: AnalyticsProps) => void;
}

function client(): PostHogLike | null {
  if (typeof window === 'undefined') return null;
  const ph = (window as unknown as { posthog?: PostHogLike }).posthog;
  return ph && typeof ph.capture === 'function' ? ph : null;
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  const ph = client();
  if (!ph) return;
  try {
    ph.capture(event, props);
  } catch {
    // Analytics tidak boleh menjatuhkan interaksi pengguna. Diam saja.
  }
}
