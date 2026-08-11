import { ImageResponse } from 'next/og';

/**
 * Kartu berbagi Open Graph / Twitter.
 *
 * Di-generate, bukan aset gambar yang dicek ke repo: warnanya ikut token
 * "Piring & Plat" dan tidak bisa basi ketika brand berubah. Halaman ini akan
 * dibagikan dari TikTok dan WhatsApp, jadi kartunya harus terbaca kecil —
 * satu kalimat besar, satu baris pendukung, tanpa detail halus.
 *
 * [DEVIASI] Memakai font default `ImageResponse`, bukan Archivo. Menyuntikkan
 * Archivo berarti mengambil file font saat build; itu menambah kegagalan build
 * yang bergantung jaringan demi perbedaan yang nyaris tidak terlihat pada
 * gambar sebesar ini.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'AI Body Coach — coach nutrisi di WhatsApp';

const IRON_900 = '#131A24';
const IRON_700 = '#2C3742';
const ENAMEL_0 = '#FFFFFF';
const ENAMEL_300 = '#C2CBC6';
const ENAMEL_400 = '#98A5A0';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: IRON_900,
        padding: 72,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 26,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: ENAMEL_400,
        }}
      >
        Coach nutrisi di WhatsApp
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: 96,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: -2,
          color: ENAMEL_0,
        }}
      >
        BULK ATAU CUT. TINGGAL CHAT.
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 30, color: ENAMEL_300, maxWidth: 700 }}>
          Foto makanan kamu, kirim ke WhatsApp. Coach-nya yang hitung.
        </div>
        {/* Plate stack — metafora yang sama dengan hero. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[96, 76, 120, 62].map((h, i) => (
            <div
              key={i}
              style={{
                width: 26,
                height: h,
                borderRadius: 6,
                background: i === 2 ? ENAMEL_0 : IRON_700,
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
