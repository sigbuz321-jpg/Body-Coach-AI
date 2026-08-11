'use client';

import { useId, useState } from 'react';

/**
 * Accordion FAQ.
 *
 * [DEVIASI] File desain memakai `onclick="this.parentElement.classList.toggle"`
 * inline dan `max-height: 300px` untuk membuka. Dua masalah:
 * 1. Tidak ada `aria-expanded`/`aria-controls`, jadi pembaca layar tidak tahu
 *    ada isi yang terbuka atau tertutup.
 * 2. `max-height` tetap memotong jawaban yang lebih tinggi dari 300px, diam-diam.
 *
 * Di sini tombolnya `<button aria-expanded aria-controls>` dan animasinya
 * memakai `grid-template-rows: 0fr -> 1fr`, yang menganimasikan tinggi asli
 * berapa pun panjang jawabannya.
 */

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface FaqProps {
  readonly items: readonly FaqItem[];
  /** Indeks yang terbuka saat pertama render. Default: semua tertutup. */
  readonly defaultOpenIndex?: number;
}

export function Faq({ items, defaultOpenIndex }: FaqProps) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(defaultOpenIndex ?? null);

  return (
    <div className="bc-faq">
      {items.map((item, i) => {
        const open = openIndex === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;
        return (
          <div key={item.question} className={`bc-faq__item${open ? ' bc-faq__item--open' : ''}`}>
            <h3 className="bc-faq__heading">
              <button
                type="button"
                id={buttonId}
                className="bc-faq__question"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : i)}
              >
                <span>{item.question}</span>
                <svg
                  className="bc-faq__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  width="24"
                  height="24"
                  aria-hidden="true"
                >
                  <path
                    d="M6 9.5l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} className="bc-faq__answer">
              <div className="bc-faq__answer-inner">
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
