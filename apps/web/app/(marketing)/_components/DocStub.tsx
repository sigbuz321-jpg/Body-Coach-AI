import Link from 'next/link';

import { ROUTES } from '../../../lib/routes';

/**
 * Halaman dokumen yang isinya belum ditulis.
 *
 * Ada karena footer landing menautkan Kebijakan Privasi, Syarat & Ketentuan,
 * dan Hubungi kami. File desain memakai `href="#"` untuk ketiganya — tautan
 * mati. Menautkan ke rute yang tidak ada menghasilkan 404, yang lebih buruk
 * lagi (dan persis jenis bug yang baru diperbaiki di M3).
 *
 * Isi ketiga dokumen ini adalah keputusan pemilik produk, bukan sesuatu yang
 * boleh dikarang di sini — apalagi kebijakan privasi untuk produk yang
 * memproses data kesehatan. Halaman ini mengatakan apa adanya sampai
 * dokumennya ada.
 */
export function DocStub({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <main className="lp-doc">
      <h1 className="lp-doc__title">{title}</h1>
      <p className="lp-doc__body">{body}</p>
      <p className="lp-doc__body">
        <Link href={ROUTES.home}>Kembali ke halaman utama</Link>
      </p>
    </main>
  );
}
