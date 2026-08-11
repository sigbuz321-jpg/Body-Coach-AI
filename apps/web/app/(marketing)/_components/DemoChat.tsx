import { formatEstimate, formatInt } from '@bodycoach/ui';

import type { LandingFood } from '../../../lib/landingFoods';

/**
 * Percakapan contoh di WhatsApp.
 *
 * Angka gizi di sini datang dari food database, sama seperti kartu makanan.
 * File desain menuliskan "±870 kkal, 38g protein" langsung di markup — kalau
 * dibiarkan, contoh percakapan di halaman depan menampilkan angka yang tidak
 * akan pernah keluar dari produk yang sebenarnya.
 *
 * Angka target harian (98/140g protein) tetap ilustratif: itu milik pengguna
 * hipotetis, bukan klaim tentang isi database.
 */

export interface DemoChatProps {
  readonly demo: LandingFood | null;
}

export function DemoChat({ demo }: DemoChatProps) {
  return (
    <div className="lp-chat">
      <div className="lp-chat__header">
        <div className="lp-chat__avatar" aria-hidden="true">
          C
        </div>
        <div>
          <div className="lp-chat__name">Coach</div>
          <div className="lp-chat__tag">Online</div>
        </div>
      </div>

      <div className="lp-chat__body">
        <div className="lp-chat__bubble lp-chat__bubble--out">
          <div className="lp-chat__photo" role="img" aria-label="Foto nasi padang">
            <span>Foto makanan</span>
            <span className="lp-chat__photo-sub">nasi padang</span>
          </div>
        </div>

        {demo ? (
          <div className="lp-chat__response">
            <p className="lp-chat__text">
              Nasi + rendang + daun singkong + sambal ijo. Estimasi{' '}
              {formatEstimate(demo.kcal, 'kkal')}, {formatInt(demo.proteinG)}g protein. Gue catat ke
              makan siang ya?
            </p>
            <div className="bc-num lp-chat__chip">
              <span className="lp-chat__chip-kcal">{formatEstimate(demo.kcal, 'kkal')}</span>
              <span aria-hidden="true">·</span>
              <span>{formatInt(demo.proteinG)}g P</span>
            </div>
            <div className="lp-chat__actions">
              <span className="lp-chat__btn lp-chat__btn--primary">Catat</span>
              <span className="lp-chat__btn lp-chat__btn--secondary">Ubah porsi</span>
            </div>
          </div>
        ) : null}

        <div className="lp-chat__bubble lp-chat__bubble--in">protein gue kurang berapa?</div>

        <div className="lp-chat__response">
          <p className="lp-chat__text">
            Hari ini 98/140g. Kurang 42g. Kalau malam mau simpel, 150g ayam + 2 telur udah nutup.
          </p>
        </div>
      </div>

      <div className="lp-chat__label">Contoh percakapan</div>
    </div>
  );
}
