'use client';

import { Button } from '@bodycoach/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearLastResult, readLastResult } from '../../../lib/lastResult';
import { ROUTES } from '../../../lib/routes';

/**
 * Layar Sambungkan WhatsApp. Mengikuti design/Rencana-_-WhatsApp.dc.html
 * "Layar B".
 *
 * Dua state:
 * - notWaiting: pesan yang akan terkirim, contoh prompt, tombol "Buka WhatsApp".
 * - waiting   : spinner dot + "Menunggu pesan pertama kamu…".
 *
 * Karena pairing ke WA belum ada di M3 (datang di M5), status "waiting"
 * hanya simulasi visual. `linkToken` adalah token MULAI-XXXX yang harus
 * dikirim user untuk menyelesaikan pairing.
 */
export default function SambungkanPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const last = readLastResult();
    setToken(last?.linkToken ?? null);
    // Deep link dirakit SERVER dan datang bersama respons onboarding (§4.1).
    // Versi lama merakitnya di sini dari `NEXT_PUBLIC_WA_BUSINESS_NUMBER` —
    // env yang tidak pernah ada, karena namanya `WA_BUSINESS_NUMBER`. Nilainya
    // selalu jatuh ke placeholder yang di-hardcode, dan setiap pengguna
    // diarahkan mengirim token pairingnya ke nomor milik orang lain.
    setWaUrl(last?.waUrl ?? null);
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="ob">
        <div className="ob-stage ob-stage--active" />
      </main>
    );
  }

  if (!token) {
    return (
      <main className="ob">
        <div className="ob-guard">
          <div className="ob-guard__icon" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="ob-guard__title">Belum ada token.</h1>
          <p className="ob-guard__body">
            Token pairing dibuat setelah onboarding selesai. Silakan mulai ulang.
          </p>
          <div className="ob-guard__btns">
            <Button onClick={() => router.push(ROUTES.onboarding)}>Mulai onboarding</Button>
          </div>
        </div>
      </main>
    );
  }

  const message = `MULAI-${token.replace(/^MULAI-/, '')}`;

  function onBukaWhatsApp() {
    if (!waUrl) return;
    setWaiting(true);
    // Buka WA di tab baru. Tidak menutup tab ini — webhook mengubah state ke
    // "linked" saat menerima pesan MULAI-XXXX.
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  function onLewati() {
    setWaiting(false);
    clearLastResult();
    router.push(ROUTES.home);
  }

  return (
    <main className="ob ob--plan">
      <div className="ob-wa">
        {!waiting ? (
          <>
            <div className="ob-wa__intro">
              <h1 className="ob-wa__title">Coach kamu udah siap.</h1>
              <p className="ob-wa__sub">
                Ketuk tombol di bawah. WhatsApp akan terbuka dengan pesan pembuka yang sudah terisi
                — tinggal kirim.
              </p>
            </div>
            <div className="ob-wa__token-card">
              <div className="ob-wa__token-label">Pesan yang akan terkirim</div>
              <div className="ob-wa__token-row">
                <div className="bc-num ob-wa__token-value">{message}</div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    stroke="var(--plate-green)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="ob-wa__token-hint">
                {waUrl
                  ? 'Kode ini yang menyambungkan chat kamu ke rencana ini.'
                  : 'Nomor WhatsApp kami belum aktif. Simpan kode ini dulu — kodenya berlaku 24 jam.'}
              </div>
            </div>
            <div className="ob-wa__prompts">
              <div className="ob-wa__prompts-label">Coba kirim ini duluan</div>
              <div className="ob-wa__prompts-list">
                <PromptRow text="Tadi gue makan nasi ayam geprek." />
                <PromptRow text="Foto makanan kamu" camera />
                <PromptRow text="Malam enaknya makan apa?" />
              </div>
            </div>
          </>
        ) : (
          <div className="ob-wa__waiting">
            <div className="ob-wa__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2 className="ob-wa__waiting-title">Menunggu pesan pertama kamu…</h2>
            <p className="ob-wa__waiting-sub">
              Halaman ini akan lanjut sendiri begitu pesan kamu masuk.
            </p>
            <div className="bc-num ob-wa__waiting-token">{message}</div>
          </div>
        )}
      </div>
      <div className={`ob-nextbar${waiting ? ' ob-nextbar--center' : ''}`}>
        {!waiting ? (
          // Tanpa `waUrl` tombolnya dinonaktifkan, bukan diarahkan ke nomor
          // cadangan: token pairing adalah kunci ke akun, dan mengirimkannya
          // ke nomor yang salah lebih buruk daripada tidak mengirim apa pun.
          <Button onClick={onBukaWhatsApp} disabled={!waUrl}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20 12.5a7 7 0 0 1-7 7H9.5L5 22v-4.2A7 7 0 0 1 4 12.5v-.5a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v.5z"
                stroke="currentColor"
                strokeWidth={1.7}
                strokeLinejoin="round"
              />
            </svg>
            {waUrl ? 'Buka WhatsApp' : 'WhatsApp belum aktif'}
          </Button>
        ) : (
          <Button variant="ghost" onClick={onLewati}>
            Lewati, lihat dashboard dulu
          </Button>
        )}
      </div>
    </main>
  );
}

function PromptRow({ text, camera = false }: { text: string; camera?: boolean }) {
  return (
    <div className="ob-wa__prompt">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {camera ? (
          <>
            <rect
              x="3"
              y="6.5"
              width="18"
              height="13"
              rx="3"
              stroke="var(--enamel-400)"
              strokeWidth={1.6}
            />
            <circle cx="12" cy="13" r="3.25" stroke="var(--enamel-400)" strokeWidth={1.6} />
            <path
              d="M9 6.5l1.2-2h3.6l1.2 2"
              stroke="var(--enamel-400)"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          </>
        ) : (
          <path
            d="M20 12.5a7 7 0 0 1-7 7H9.5L5 22v-4.2A7 7 0 0 1 4 12.5v-.5a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v.5z"
            stroke="var(--enamel-400)"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span>{text}</span>
    </div>
  );
}
