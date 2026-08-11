import type { Metadata } from 'next';

import { DocStub } from '../_components/DocStub';

export const metadata: Metadata = { title: 'Kebijakan Privasi — AI Body Coach' };

export default function PrivasiPage() {
  return (
    <DocStub
      title="Kebijakan Privasi"
      body="Dokumen ini sedang disiapkan dan akan terbit sebelum layanan dibuka untuk umum. Ringkasnya: data tinggi, berat, dan catatan makan kamu dipakai hanya untuk membuat rekomendasi personal, tidak dijual, dan bisa kamu hapus kapan saja."
    />
  );
}
