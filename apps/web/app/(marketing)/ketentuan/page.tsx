import type { Metadata } from 'next';

import { DocStub } from '../_components/DocStub';

export const metadata: Metadata = { title: 'Syarat & Ketentuan — AI Body Coach' };

export default function KetentuanPage() {
  return (
    <DocStub
      title="Syarat & Ketentuan"
      body="Dokumen ini sedang disiapkan dan akan terbit sebelum layanan dibuka untuk umum. Layanan ini memberi panduan nutrisi umum, bukan nasihat medis."
    />
  );
}
