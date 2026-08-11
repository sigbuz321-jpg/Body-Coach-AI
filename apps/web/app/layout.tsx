import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import '@bodycoach/ui';
import './(marketing)/landing.css';
import './(onboarding)/onboarding.css';
import './globals.css';

/**
 * [DEVIASI] File desain memuat font lewat `<link>` ke fonts.googleapis.com.
 * Di sini ketiganya di-self-host lewat `next/font/google`: stylesheet dari
 * Google adalah render-blocking request ke origin ketiga, dan halaman landing
 * punya anggaran LCP < 2,5 detik di 4G. `next/font` juga menyisipkan metrik
 * fallback, sehingga pergantian font tidak menggeser tata letak (CLS).
 *
 * Bobot dibatasi pada yang benar-benar dipakai skala tipografi di CLAUDE.md.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display-loaded',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body-loaded',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono-loaded',
  display: 'swap',
});

/**
 * `metadataBase` dibutuhkan agar URL gambar Open Graph absolut. Tanpa ini Next
 * memperingatkan dan menghasilkan URL relatif, yang tidak bisa diambil crawler
 * WhatsApp maupun TikTok. `APP_URL` diisi per environment; localhost hanya
 * cadangan untuk pengembangan.
 */
const appUrl = process.env['APP_URL'] ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'AI Body Coach',
    template: '%s',
  },
  description: 'Coach nutrisi berbasis AI untuk kamu yang sedang bulk atau cut.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className={`${archivo.variable} ${jakarta.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
