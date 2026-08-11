import { PRICING, yearlySavingsPercent } from '@bodycoach/core';
import { Faq, FoodCard, formatIdr, PlateStack, PricingCard } from '@bodycoach/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { loadLandingFoods } from '../../lib/landingFoods';
import { ROUTES } from '../../lib/routes';
import { Cta, LandingViewed } from './_components/Cta';
import { DemoChat } from './_components/DemoChat';

/**
 * Landing page (M4). Sumber desain: `design/Landing-Page.dc.html`.
 *
 * Server component: kartu makanan dan angka di percakapan contoh dirender dari
 * Indonesian Food Database. Di-cache satu jam — isi food database berubah
 * jarang, dan halaman ini harus cepat (DoD: LCP < 2,5 detik di 4G).
 *
 * Perbaikan wajib yang diterapkan saat port (CLAUDE.md):
 * - "Setiap orang beda目标" -> "Setiap orang beda tujuan" (dua karakter Han bocor).
 * - Harga dari `PRICING` di @bodycoach/core, tidak di-hardcode per layar.
 * - Angka kalori dari database, bukan dari markup.
 *
 * Bug lain yang ditemukan di file desain dan ikut diperbaiki:
 * - Jawaban FAQ akurasi berbunyi "estimasi następnyanya makin tepat" — ada kata
 *   Polandia yang bocor, seperti halnya 目标. Diperbaiki jadi "berikutnya".
 * - `class="chip-kkal"` di percakapan contoh tidak pernah cocok dengan CSS
 *   `.chip-kcal`, jadi gaya angka kalorinya diam-diam tidak berlaku.
 */

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'AI Body Coach — Coach Nutrisi di WhatsApp',
  description:
    'Foto makanan kamu, kirim ke WhatsApp. Coach-nya yang hitung, ingat target kamu, dan bilang apa yang sebaiknya kamu makan berikutnya.',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'AI Body Coach',
    title: 'BULK atau CUT. Tinggal chat.',
    description:
      'Coach nutrisi di WhatsApp untuk kamu yang sedang bulk atau cut. Gratis untuk mulai, tanpa download aplikasi.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BULK atau CUT. Tinggal chat.',
    description: 'Coach nutrisi di WhatsApp. Gratis untuk mulai, tanpa download aplikasi.',
  },
};

const STEPS = [
  {
    number: '01',
    title: 'Jawab 10 pertanyaan',
    desc: 'Kami hitung target kalori dan protein kamu.',
  },
  {
    number: '02',
    title: 'Chat coach di WhatsApp',
    desc: 'Foto atau ketik makanan kamu. Tidak perlu buka aplikasi.',
  },
  {
    number: '03',
    title: 'Lihat progress',
    desc: 'Berat, kalori, dan tren mingguan di satu halaman.',
  },
] as const;

const FAQ_ITEMS = [
  {
    question: 'Perlu download aplikasi?',
    answer:
      'Tidak. Semua interaksi lewat WhatsApp yang sudah ada di HP kamu. Web hanya untuk onboarding dan lihat progress.',
  },
  {
    question: 'Seakurat apa estimasi dari foto?',
    answer:
      'Estimasi, bisa dikoreksi 1 ketukan. Tren lebih penting daripada angka satu kali makan. Coach akan belajar dari koreksi kamu supaya estimasi berikutnya makin tepat.',
  },
  {
    question: 'Data saya aman?',
    answer:
      'Ya. Data nutrition kamu dienkripsi dan tidak pernah dijual. Kamu bisa hapus semua data kapan saja lewat pengaturan.',
  },
  {
    question: 'Bisa berhenti kapan saja?',
    answer: 'Bisa. Langsung berhenti tanpa biaya tambahan. Tidak ada kontrak mengikat.',
  },
  {
    question: 'Bedanya sama aplikasi calorie tracker lain?',
    answer:
      'Kamu tidak perlu buka aplikasi dan ketik manual. Cukup chat seperti biasa. Coach yang adaptif sama makanan Indonesia — bukan cuma "chicken breast dan brokoli".',
  },
] as const;

const FREE_FEATURES = [
  'Target kalori dan makro personal',
  '3 catatan makanan per hari',
  '1 analisis foto per hari',
  'Chat coach terbatas',
] as const;

const PRO_FEATURES = [
  'Catatan makanan tanpa batas',
  'Analisis foto tanpa batas',
  'Rekomendasi makanan harian',
  'Check-in berat harian',
  'Laporan tren mingguan',
  'Riwayat penuh',
] as const;

export default async function LandingPage() {
  const { foods, demo } = await loadLandingFoods();

  return (
    <>
      <LandingViewed />

      <nav className="lp-nav">
        <div className="lp-container lp-nav__inner">
          <span className="lp-nav__logo">AI Body Coach</span>
          <Cta placement="nav" className="lp-nav__cta">
            Mulai gratis
          </Cta>
        </div>
      </nav>

      <main id="konten">
        <section className="lp-hero">
          <div className="lp-container lp-hero__inner">
            <div className="lp-hero__content">
              <p className="lp-eyebrow">Coach nutrisi di WhatsApp</p>
              <h1 className="lp-hero__headline">BULK ATAU CUT. TINGGAL CHAT.</h1>
              <p className="lp-hero__sub">
                Foto makanan kamu, kirim ke WhatsApp. Coach-nya yang hitung, ingat target kamu, dan
                bilang apa yang sebaiknya kamu makan berikutnya.
              </p>
              <div className="lp-hero__ctas">
                <Cta placement="hero" className="lp-btn lp-btn--primary">
                  Mulai gratis
                </Cta>
                <a href="#cara-kerja" className="lp-btn lp-btn--secondary">
                  Lihat cara kerjanya
                </a>
              </div>
              <p className="lp-hero__micro">Gratis untuk mulai. Tanpa download aplikasi.</p>
            </div>
            <div className="lp-hero__plates">
              <PlateStack consumedKcal={1830} targetKcal={2650} />
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--bg">
          <div className="lp-container">
            <h2 className="lp-title">Begini rasanya.</h2>
            <DemoChat demo={demo} />
          </div>
        </section>

        <section className="lp-section lp-section--surface" id="cara-kerja">
          <div className="lp-container">
            <h2 className="lp-title">Gampang banget.</h2>
            <p className="lp-sub">Tiga langkah, selesai.</p>
            <div className="lp-steps">
              {STEPS.map((s) => (
                <div key={s.number} className="lp-step">
                  <div className="bc-num lp-step__number">{s.number}</div>
                  <h3 className="lp-step__title">{s.title}</h3>
                  <p className="lp-step__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--bg">
          <div className="lp-container">
            <h2 className="lp-title">Bukan cuma chicken breast dan brokoli.</h2>
            <p className="lp-note">
              Database makanan Indonesia — warteg, Padang, street food, sampai kopi susu kekinian.
            </p>
            {foods.length > 0 ? (
              <div className="lp-foods">
                {foods.map((f) => (
                  <FoodCard
                    key={f.name}
                    name={f.name}
                    kcal={f.kcal}
                    portionLabel={f.portionLabel}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="lp-section lp-section--surface">
          <div className="lp-container">
            <h2 className="lp-title">Coach yang ngerti tujuan lo.</h2>
            <p className="lp-sub">Setiap orang beda tujuan, strateginya beda.</p>
            <div className="lp-goals">
              <div className="lp-goal lp-goal--bulk">
                <div className="lp-goal__label">BULK</div>
                <p className="lp-goal__problem">Udah makan banyak tapi berat nggak naik.</p>
                <p className="lp-goal__solution">
                  Coach bantu kamu konsisten surplus tanpa jadi gendut.
                </p>
              </div>
              <div className="lp-goal lp-goal--cut">
                <div className="lp-goal__label">CUT</div>
                <p className="lp-goal__problem">Udah gym tapi lemak nggak turun.</p>
                <p className="lp-goal__solution">
                  Coach bantu kamu defisit tanpa harus berhenti makan nasi.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--bg" id="harga">
          <div className="lp-container">
            <h2 className="lp-title">Langganan yang jujur.</h2>
            <p className="lp-sub">Tidak ada harga tersembunyi. Berhenti kapan saja.</p>
            <div className="lp-pricing">
              <PricingCard
                name="Gratis"
                priceIdr={PRICING.freeIdr}
                period="untuk selalu"
                features={FREE_FEATURES}
                cta={
                  <Cta placement="pricing_free" className="lp-btn lp-btn--plan lp-btn--plan-ghost">
                    Mulai gratis
                  </Cta>
                }
              />
              <PricingCard
                featured
                badge="Untuk yang serius 3 bulan ke depan"
                name="Pro"
                priceIdr={PRICING.monthlyIdr}
                period="/ bulan"
                note={
                  <>
                    <span className="lp-save">Hemat {yearlySavingsPercent()}%</span>
                    <span className="lp-save__note">
                      atau {formatIdr(PRICING.yearlyIdr)} / tahun
                    </span>
                  </>
                }
                features={PRO_FEATURES}
                cta={
                  <Cta placement="pricing_pro" className="lp-btn lp-btn--plan lp-btn--plan-solid">
                    Mulai langganan
                  </Cta>
                }
              />
            </div>
          </div>
        </section>

        <section className="lp-section lp-section--surface">
          <div className="lp-container">
            <h2 className="lp-title">Pertanyaan umum.</h2>
            <Faq items={FAQ_ITEMS} />
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer__inner">
          <div className="lp-footer__brand">
            <span className="lp-footer__logo">AI Body Coach</span>
            <span className="lp-footer__tagline">Coach nutrisi di WhatsApp.</span>
          </div>
          <div className="lp-footer__links">
            <Link href={ROUTES.privasi} className="lp-footer__link">
              Kebijakan Privasi
            </Link>
            <Link href={ROUTES.ketentuan} className="lp-footer__link">
              Syarat &amp; Ketentuan
            </Link>
            <Link href={ROUTES.kontak} className="lp-footer__link">
              Hubungi kami
            </Link>
          </div>
        </div>
        <div className="lp-container">
          <p className="lp-footer__disclaimer">
            Panduan nutrisi umum, bukan nasihat medis. Konsultasikan dengan tenaga kesehatan jika
            kamu punya kondisi tertentu.
          </p>
        </div>
      </footer>

      <div className="lp-mobilebar">
        <Cta placement="mobile_bar" className="lp-btn lp-btn--primary lp-btn--grow">
          Mulai gratis
        </Cta>
        <a href="#cara-kerja" className="lp-btn lp-btn--secondary lp-btn--grow">
          Cara kerja
        </a>
      </div>
    </>
  );
}
