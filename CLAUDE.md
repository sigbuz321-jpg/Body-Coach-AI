# CLAUDE.md

Konteks proyek untuk agen coding. Dibaca setiap sesi. Detail panjang ada di `docs/`.

> **Status 11 Agustus 2026 — M0, M1, M2 selesai. Berikutnya M3.**
> Sebelum mulai, baca bagian **"⇥ MULAI DARI SINI"** di awal `PLAN.md`. Isinya
> jebakan lingkungan yang sudah pernah memakan waktu (pnpm tidak di PATH,
> `DIRECT_URL` harus session pooler karena koneksi langsung Supabase IPv6-only,
> prettier tidak boleh menyentuh markdown dan snapshot), daftar penyimpangan dari
> spesifikasi yang sudah diterapkan, dan utang yang belum dibayar.
Design token di bawah **sudah diverifikasi** terhadap `design/preview/*.html` dan keempat layar pada 10 Agustus 2026.

---

## Produk

**AI Body Coach** — coach nutrisi berbasis AI untuk orang Indonesia yang sedang BULK (naik berat & massa otot) atau CUT (turun lemak). Pengguna menyelesaikan onboarding 10 langkah di web, menerima target kalori dan makro personal, lalu beraktivitas sehari-hari lewat WhatsApp: kirim foto makanan, ketik apa yang dimakan, tanya "malam makan apa?", update berat badan. Web dipakai untuk onboarding dan melihat progres; WhatsApp dipakai untuk melakukan.

Target pengguna: 18–30 tahun, gym 2–5x/minggu, pemula–menengah, sudah pernah mencoba aplikasi tracking dan berhenti karena ribet. Monetisasi: Free / Pro Rp39.000 per bulan atau Rp299.000 per tahun.

Yang dijual **bukan** penghitungan kalori. Yang dijual adalah: _AI tahu apa yang harus kamu lakukan berikutnya._

---

## Aturan yang tidak boleh dilanggar

**AD-1 — LLM tidak pernah menjadi sumber angka gizi.**
Vision hanya mengenali makanan dan mengestimasi gram. Semua kalori dan makro berasal dari food database + nutrition engine deterministik. Sebelum balasan dikirim, angka di dalamnya dicocokkan dengan hasil engine; kalau tidak cocok, pakai template deterministik.

**AD-2 — WhatsApp adalah transport asinkron.**
Handler webhook hanya: verifikasi signature → dedup → enqueue → balas 200. Tidak ada pemanggilan AI di dalamnya. Idempotency wajib di dua lapis (Redis SETNX + unique constraint DB).

**AD-3 — Modular monolith.** Satu deployable web + satu worker runtime.

**AD-4 — Target kalori append-only.** Rekalibrasi membuat baris `target_versions` baru. **Tidak pernah `UPDATE` baris target lama.**

**Batas dependency.** `packages/core` dilarang mengimpor framework, SDK vendor, atau melakukan I/O. SDK AI vendor hanya di `packages/ai/providers/`.

**Guardrail keselamatan adalah syarat rilis, bukan fitur.** Blokir BMI, deteksi bahasa gangguan makan, penanganan klaim medis. Dibangun di M2. Setiap hasil "block" tidak boleh mengembalikan angka kalori apa pun.

**Format angka.** Estimasi selalu diawali `±`. Semua angka diformat `id-ID`: ribuan pakai titik (`1.830`), desimal pakai koma (`63,4 kg`, `+0,8 kg`). Gunakan `Intl.NumberFormat('id-ID')`, jangan format manual.

---

## Design tokens — terverifikasi

Sistem **"Piring & Plat"**. Warna tidak pernah dekoratif kecuali yang dikecualikan eksplisit di bawah.

```css
/* Enamel */
--enamel-0:#FFFFFF  --enamel-50:#F5F7F6  --enamel-100:#EAEEEC
--enamel-200:#DCE2DF --enamel-300:#C2CBC6 --enamel-400:#98A5A0
/* Iron */
--iron-500:#6B7780 --iron-600:#4A555E --iron-700:#2C3742
--iron-900:#131A24 --iron-950:#0C1119
/* Plate */
--plate-blue:#1156C7    --plate-blue-tint:#E8F0FC
--plate-red:#E0332C     --plate-red-tint:#FDEBEA
--plate-yellow:#F5B301  --plate-yellow-tint:#FEF5E0
--plate-yellow-ink:#8B6914   /* teks di atas yellow-tint; yellow murni gagal kontras */
--plate-green:#1E9E5A   --plate-green-tint:#E6F5ED
/* Semantik */
--bg:#F5F7F6 --surface:#FFFFFF --fg:#131A24 --muted:#6B7780
--border:#DCE2DF --accent:#1156C7
/* Bentuk & gerak */
--radius-card:16px --radius-sheet:24px --radius-pill:999px
--radius-inner:12px  /* enamel rim, stat-tile */  --radius-xs:8px /* thumbnail, preview */
--motion:200ms cubic-bezier(.32,.72,0,1)
/* Font */
--font-display:'Archivo',sans-serif
--font-body:'Plus Jakarta Sans',system-ui,sans-serif
--font-mono:'JetBrains Mono',monospace
```

**Dark mode** (hanya Dashboard yang mendukung; landing/onboarding/rencana light-only):

```css
[data-theme="dark"]{
  --bg:#0C1119; --surface:#131A24; --fg:#EAEEEC; --muted:#98A5A0; --border:#2C3742;
  --enamel-100:#1E2832; --enamel-200:#2C3742; --enamel-300:#4A555E;
}
```

Warna plate **tidak** diubah di dark mode. Yang berubah hanya teks di atas tint: `--plate-yellow-ink` → `--plate-yellow`, dan teks insight biru → `#93C5FD` dengan background `rgba(17,86,199,.15)`.

**Skala tipografi (nilai nyata dari file desain)**

| Peran             | Font                  | Size/LH                          | Catatan                              |
| ----------------- | --------------------- | -------------------------------- | ------------------------------------ |
| Hero              | Archivo 800           | 56/61 desktop, 40/44 mobile      | tracking −0.02em, UPPERCASE          |
| Judul layar       | Archivo 800           | 32/36                            | onboarding & "Coach kamu udah siap." |
| Judul section     | Archivo 700           | 32/38 atau 26/32                 |                                      |
| Judul kartu besar | Archivo 700           | 21/28                            |                                      |
| Card title        | Plus Jakarta Sans 600 | 17/26                            |                                      |
| Body              | PJS 400               | 15/23                            |                                      |
| Caption           | PJS 400/500           | 13/20                            |                                      |
| Label             | PJS 600               | 12/16, tracking .08em, UPPERCASE |                                      |
| Data XL           | JetBrains Mono 700    | 44/48                            | angka kkal utama                     |
| Data L            | Mono 700              | 28/32                            | berat badan                          |
| Data M            | Mono 700              | 24 / 18–24                       | stat tile, nilai makro               |
| Data S            | Mono 500              | 12–14                            | satuan, sub-label                    |

Semua data pakai `font-variant-numeric: tabular-nums`. Satuan (`kkal`, `g`, `kg`) selalu lebih kecil dan `--muted`.

**Spacing:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40. Padding layar 20px, padding card 20px (kartu hero 24px atas).

**Tinggi kontrol:** tombol utama 52px · tombol sekunder/teks 48px · chip pilihan 48px · icon button 44px (bulat) · tombol kecil 36px. **Minimum tap target 44px**, bukan 48.

**Border:** card 1px `--border`; tombol sekunder dan chip **2px**.

**Enamel rim** (Plan Card, Today Card): `::before { position:absolute; inset:4px; border:1px solid var(--border); border-radius:12px; pointer-events:none }`.

**Plate Stack** — ada di dua tempat, dengan dua ukuran:

- _Landing (hero)_: plat tinggi 88px, lebar 18–35px, radius 4px, `--iron-700`, huruf "P" mono 11px putih di tengah; batang 2px `--enamel-300`; angka mono 44px di kanan. Animasi `plateIn` 400ms `cubic-bezier(.34,1.56,.64,1)`, delay bertingkat 0/120/240/360ms.
- _Dashboard (Hari Ini)_: plat 12×32px, radius 3px; track 8px `--enamel-200`; bar terisi `--iron-700`, berubah `--plate-red` saat >100%; label "4 makanan".

**Pengecualian aturan "warna = makna":** `--accent` (= plate-blue) dipakai sebagai warna UI umum untuk link, `:focus-visible`, `::selection`, dan kartu insight. Ini disengaja — biru sebagai afordans antarmuka, bukan sebagai penanda BULK. Jangan tafsirkan chrome biru sebagai sinyal goal.

**Pengecualian aturan "tanpa gradient":** kartu Pro memakai `linear-gradient(135deg, var(--iron-900), var(--iron-700))`, tanpa border. Hanya di kartu Pro. Tidak boleh menyebar.

---

## Konflik yang ditemukan & keputusannya

**1. Warna makro tidak konsisten antar file — WAJIB diseragamkan sebelum M3.**

| Sumber                             | Protein         | Karbo            | Lemak          |
| ---------------------------------- | --------------- | ---------------- | -------------- |
| `Rencana-_-WhatsApp` (plan reveal) | hijau `#1E9E5A` | kuning `#F5B301` | biru `#1156C7` |
| `Dashboard` + `components.html`    | **biru**        | kuning           | **merah**      |

Pengguna yang sama melihat protein hijau di layar rencana lalu protein biru di dashboard, satu ketukan setelahnya.
**Keputusan: pakai versi plan reveal** — Protein hijau, Karbo kuning, Lemak biru. Alasannya merah sudah punya arti "melewati target" di Plate Stack dan status row; memakai merah untuk lemak membuat dashboard terbaca seolah lemak selalu bermasalah. Perbaiki `.macro-bar.protein/.fat` di Dashboard dan `components.html` saat mengerjakan M8.

**2. Harga berbeda antar file.** `preview/colors-primary.html` menampilkan **Rp 79.000/bulan**; landing dan dashboard menampilkan **Rp39.000**. PRD menetapkan Rp39.000.
**Keputusan: Rp39.000.** Angka di colors-primary adalah sisa eksplorasi, abaikan. Harga hanya boleh berasal dari satu konstanta di kode, jangan di-hardcode per layar.
✅ **Diterapkan di M4** — `PRICING` di `packages/core/src/pricing.ts`. "Hemat 36%" juga dihitung dari konstanta itu, bukan ditulis tangan.

**3. Karakter asing di copy landing.** Di section goal: `"Setiap orang beda目标, strateginya beda."` — ada dua karakter Han (目标) yang bocor.
**Keputusan: ganti menjadi** `"Setiap orang beda tujuan, strateginya beda."`
✅ **Diterapkan di M4.** Ditemukan satu lagi jenis yang sama saat port: jawaban FAQ akurasi berbunyi `"estimasi następnyanya makin tepat"` — kata Polandia yang bocor. Diperbaiki jadi `"estimasi berikutnya makin tepat"`. Kalau menemukan file desain lain, **pindai dulu karakter/kata non-Indonesia sebelum menyalin copy-nya**.

**4. Variabel CSS tidak terdefinisi.** `--iron-400` dan `--iron-300` dipakai di hover tombol sekunder dan chip (`components.html`, `components-buttons.html`) tapi tidak pernah dideklarasikan — hover-nya diam-diam tidak berfungsi.
**Keputusan: tambahkan** `--iron-300:#A7B3AD` dan `--iron-400:#87948E`. Saat ini hanya dipakai untuk border, jadi aman; verifikasi kontras dulu kalau nanti dipakai untuk teks.

**5. Empat file preview merujuk stylesheet yang tidak ada.** `colors-primary`, `components-buttons`, `spacing-tokens`, `typography-specimens` me-link `../colors_and_type.css` yang tidak ada di folder — file-file itu render tanpa token kalau dibuka sendiri. Yang lengkap dan berdiri sendiri: `colors.html`, `typography.html`, `spacing.html`, `surfaces.html`, `components.html`. **Pakai lima file itu sebagai rujukan token.**

**6. Ukuran label berbeda.** Preview specimen menulis label 11px; keempat layar nyata konsisten memakai 12/16. **Pakai 12/16.**

**7. Typo class.** `.wa-banne` di Dashboard (kurang huruf "r"). Perbaiki saat port ke React.

**8. Angka kalori makanan di landing adalah placeholder.** Nasi Padang ±870, Ayam Geprek ±430, dst. Angka-angka ini **harus** dibuat sama dengan isi Indonesian Food Database, atau hal pertama yang dilakukan calon pengguna adalah menangkap produk kamu salah hitung. Render dari DB, jangan hardcode di landing.
✅ **Diterapkan di M4** — `apps/web/lib/landingFoods.ts`, termasuk angka di percakapan contoh. Nilai nyata jauh berbeda dari placeholder (Nasi Padang ±735, bukan ±870). Kartu "Warteg" diganti "Rendang daging sapi": warteg itu jenis warung, bukan hidangan, jadi tidak ada barisnya di database dan tidak punya angka yang bisa dipertanggungjawabkan.

**Masih terbuka, butuh keputusan pemilik produk**

- [ ] Nama brand final (dokumen masih `[Brand]`).
- [ ] Provider pembayaran: Xendit atau Midtrans.
- [ ] Nomor WhatsApp Business dan status verifikasi Meta.
- [ ] Biaya aktual (vision, token, template WA) untuk memvalidasi harga Rp39.000.
- [ ] Apakah dark mode diperluas ke onboarding & landing, atau tetap dashboard saja.

---

## Sumber desain

```
design/Landing-Page.dc.html        → M4   (HTML+CSS biasa, bisa dibuka langsung)
design/Onboarding.dc.html          → M3   (HTML+CSS biasa)
design/Dashboard.dc.html           → M8   (HTML+CSS+JS, personalisasi sudah diimplementasi di JS)
design/Rencana-_-WhatsApp.dc.html  → M3   (format Claude Design: tag <x-dc>, <sc-if>, binding {{ }},
                                           butuh ./support.js — TIDAK bisa dipakai langsung,
                                           harus dibangun ulang sebagai React)
design/preview/{colors,typography,spacing,surfaces,components}.html → rujukan token
```

**Layar yang belum ada desainnya** (perlu dibuat sendiri mengikuti sistem ini): Riwayat, Akun & Pengaturan, halaman Pro/paywall penuh, halaman Laporan Mingguan yang bisa dibagikan, kartu berbagi 4:5 untuk Instagram Story.

**Aturan penerjemahan desain → kode**

1. File HTML itu output desain, bukan kode produksi. Jangan salin mentah.
2. Ambil dari sana: nilai token, struktur layout, hierarki komponen, dan **seluruh copy Bahasa Indonesia apa adanya** (kecuali perbaikan di daftar konflik di atas).
3. Bangun ulang sebagai komponen React yang dapat dipakai ulang di `packages/ui/`, memakai token — bukan nilai hardcode dari file desain.
4. Buat semua state: default, hover, focus, disabled, loading, error, empty, selected.
5. Laporkan setiap penyimpangan dari desain beserta alasannya.

**Personalisasi Dashboard sudah tertulis di JS `design/Dashboard.dc.html`** — baca fungsi `applyPersonalization()` sebagai spesifikasi, jangan mereka-reka sendiri. Cakupannya: aksen per goal, status per rentang waktu (5–10, 10–15, 15–19, 19–23), kartu "Cara Pakai" hari 1–3, kartu "Penyesuaian Target" hari 15+, banner sambungkan WhatsApp, dan varian Free/Pro.

---

## Copy & voice

**Dua suara, tidak boleh tertukar.**

Antarmuka web — tenang, jelas, sentence case:

> "Target kamu dihitung dari tinggi, berat, umur, dan aktivitas."

Coach di WhatsApp — teman gym, ikuti kata ganti pengguna, maksimal satu emoji:

> "Protein lo masih kurang 42g. 150g ayam + 2 telur udah nutup kok."

Berlaku untuk keduanya:

- **Selalu ada langkah berikutnya.** Angka tanpa saran = belum selesai.
- **Estimasi ditulis sebagai estimasi:** `±720 kkal`.
- **Tidak ada janji hasil.** "Perkiraan 6–8 bulan".
- **Tidak ada rasa bersalah.** "Hari ini lewat 300 kkal. Besok normal lagi aja."
- **Error menjelaskan dan memberi jalan keluar.**
- **Kata kerja konsisten:** tombol "Catat" → konfirmasi "Tercatat."

Dilarang: _bakar lemak, detox, dijamin, gagal, makanan terlarang_, dan angka target apa pun untuk pengguna yang diblokir guardrail.

---

## Stack & struktur

```
apps/web/          Next.js 15 App Router — landing, onboarding, dashboard, API routes
apps/worker/       job runtime (Inngest/Trigger)
packages/core/     domain murni: nutrition, food, coach, types — TANPA I/O
packages/db/       schema, migration, repository (Postgres + pgvector + pg_trgm)
packages/ai/       providers/ (satu-satunya tempat SDK vendor), prompts/ (versioned)
packages/whatsapp/ client, template, interactive builder
packages/ui/       design system
data/seeds/food/   CSV food database Indonesia
tooling/evals/     eval akurasi makanan & guardrail
```

Postgres (Supabase) · Redis (Upstash) · Meta WhatsApp Cloud API · Xendit/Midtrans (QRIS + e-wallet + VA) · Sentry + PostHog.

**Jangan pernah** memakai library WhatsApp tidak resmi (Baileys, whatsapp-web.js).

Detail: `docs/02-technical-spec.md` §1–3.

---

## Perintah

> Terverifikasi jalan per M0 (11 Agustus 2026). Butuh pnpm 11 di PATH.

```
pnpm install       pasang dependency seluruh workspace
pnpm dev           Next.js di http://localhost:3000
pnpm build         build produksi
pnpm typecheck     tsc --noEmit di 7 package (lewat turbo)
pnpm lint          eslint seluruh workspace, termasuk aturan batas dependency
pnpm test          vitest
pnpm test:coverage vitest + ambang coverage 100% pada packages/core/src/nutrition
pnpm format        prettier --write   ·   pnpm format:check untuk CI
```

`typecheck`, `build`, `dev` dijalankan per package lewat Turborepo. `lint` dan `test` dijalankan sekali di root (`eslint.config.mjs`, `vitest.config.ts`) supaya aturan lintas package dievaluasi dari satu tempat.

```
pnpm db:migrate    terapkan migration yang belum jalan (idempoten, aman diulang)
pnpm db:seed       muat data makanan dari data/seeds/food/ (idempoten)
```

Keduanya membaca `.env.local` dan memakai `DIRECT_URL` (session pooler :5432), bukan `DATABASE_URL`. `pnpm evals` menyusul di M6.

---

## Konvensi kode

- TypeScript strict. Tanpa `any` implisit. `as` hanya di boundary parsing dengan validasi.
- Validasi input dengan Zod di boundary; tipe domain diturunkan dari skema.
- Endpoint mutasi menerima header `Idempotency-Key`.
- Event analytics: `noun.verb` (`food.logged`, `onboarding.completed`). Daftar di `docs/01-system-design.md` §11.
- Error: `Result<T,E>` eksplisit di `core`; exception hanya di boundary.
- Prompt AI sebagai file versioned (`coach.v1.ts`), tidak pernah string inline.
- Test bersebelahan dengan sumbernya (`*.test.ts`).
- Nomor WhatsApp di-hash sebelum masuk log. Isi pesan tidak pernah dikirim ke error tracker.
- RLS aktif di semua tabel user-scoped; service role hanya untuk worker.
- Semua angka lewat helper format `id-ID` terpusat, tidak ada `toFixed` tersebar.

---

## Di luar cakupan MVP

Workout coach · trainer dashboard B2B · aplikasi mobile · integrasi wearable · meal planning otomatis · body recomposition mode · bahasa selain Indonesia.

Kalau permintaan mengarah ke salah satu di atas, ingatkan bahwa itu di luar MVP sebelum mengerjakannya.
