'use client';

import { useId, useState } from 'react';

/**
 * Accordion "Dari mana angka ini?" yang muncul di kartu rencana.
 *
 * Pelipat sederhana; controlled by internal state. Saat dibuka menampilkan
 * tiga paragraf penjelasan bahwa target dihitung dari kebutuhan dasar tubuh
 * lalu disesuaikan aktivitas dan surplus/defisit.
 */
export function PlanExplainer() {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <div className="bc-plan-explainer">
      <button
        type="button"
        className="bc-plan-explainer__toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Dari mana angka ini?</span>
        <span
          className="bc-plan-explainer__chevron"
          data-open={open || undefined}
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9.5l6 6 6-6"
              stroke="var(--muted)"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <div id={contentId} className="bc-plan-explainer__body">
          <p>
            Kami mulai dari kebutuhan dasar tubuh kamu saat istirahat — dihitung dari tinggi, berat,
            dan umur.
          </p>
          <p>
            Angka itu dikalikan dengan seberapa aktif hari-hari kamu dan berapa kali kamu latihan
            seminggu.
          </p>
          <p>
            Terakhir kami tambah surplus kecil yang terkendali, atau defisit untuk tujuan turun
            lemak. Setiap minggu angkanya disesuaikan lagi dari berat kamu yang terbaru.
          </p>
        </div>
      ) : null}
    </div>
  );
}
