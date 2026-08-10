# AI Body Coach

Coach nutrisi berbasis AI untuk orang Indonesia yang sedang bulk atau cut.
Onboarding dan progres di web, aktivitas harian lewat WhatsApp.

Konteks produk dan aturan yang tidak boleh dilanggar: [`CLAUDE.md`](./CLAUDE.md).
Rencana implementasi per milestone: [`PLAN.md`](./PLAN.md).

---

## Prasyarat

- Node.js ≥ 20.11 (dikembangkan di 24.x)
- pnpm 11 — `npm i -g pnpm`, lalu pastikan `%APPDATA%\npm` ada di PATH

## Perintah

```bash
pnpm install       # pasang dependency seluruh workspace
pnpm dev           # Next.js di http://localhost:3000
pnpm build         # build produksi
pnpm typecheck     # tsc --noEmit di 7 package (lewat turbo)
pnpm lint          # eslint seluruh workspace, termasuk aturan batas dependency
pnpm test          # vitest
pnpm format        # prettier --write
```

`typecheck`, `build`, dan `dev` dijalankan per package lewat Turborepo.
`lint` dan `test` dijalankan sekali di root dengan satu konfigurasi
(`eslint.config.mjs`, `vitest.config.ts`) supaya aturan lintas package —
terutama batas dependency — dievaluasi dari satu tempat.

Perintah `db:migrate`, `db:seed`, dan `evals` menyusul di M1 dan M6.

## Struktur

```
apps/web/          Next.js 15 App Router — landing, onboarding, dashboard, API routes
apps/worker/       job runtime (Inngest/Trigger)
packages/core/     domain murni: nutrition, food, coach, types — TANPA I/O
packages/db/       schema, migration, repository
packages/ai/       providers/ (satu-satunya tempat SDK vendor), prompts/ (versioned)
packages/whatsapp/ client, template, interactive builder
packages/ui/       design system "Piring & Plat"
design/            output desain (HTML) + preview token — rujukan, bukan kode produksi
docs/              spesifikasi teknis & design system
```

## Batas dependency

Dua aturan ditegakkan oleh ESLint dan **gagal di CI**, bukan sekadar konvensi:

1. **`packages/core` adalah domain murni.** Dilarang mengimpor framework
   (`next`, `react`), SDK vendor, package workspace lain, Node builtin, atau
   apa pun yang berarti I/O. Lapis kedua: `tsconfig.json` di `packages/core`
   memakai `"types": []`, sehingga `import 'node:fs'` juga gagal di typecheck.
2. **SDK vendor AI hanya boleh di `packages/ai/src/providers/`.**

Cara memeriksa ulang bahwa aturan ini benar-benar memblokir: tambahkan
`import fs from 'node:fs'` di file mana pun di `packages/core/src/`, jalankan
`pnpm lint`, dan pastikan lint gagal. Hapus lagi setelahnya.

## Environment

Salin `.env.example` ke `.env.local` dan isi. Daftar variabel mengikuti
`docs/02-technical-spec.md` §2. Jangan commit file `.env` yang sudah terisi.

## Status

M0 (scaffolding), M1 (skema database & seed), dan M2 (nutrition engine &
guardrail) selesai. Berikutnya M3 — onboarding 10 langkah dan plan reveal.

Titik masuk untuk siapa pun yang baru bergabung: bagian **"⇥ MULAI DARI SINI"**
di awal [`PLAN.md`](./PLAN.md).
