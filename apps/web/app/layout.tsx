import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@bodycoach/ui';
import './(onboarding)/onboarding.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Body Coach',
  description: 'Coach nutrisi berbasis AI untuk kamu yang sedang bulk atau cut.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
