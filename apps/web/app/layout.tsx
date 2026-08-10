import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'AI Body Coach',
  description: 'Coach nutrisi berbasis AI untuk kamu yang sedang bulk atau cut.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
