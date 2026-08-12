# PLAN.md — Rencana Implementasi

Milestone berurutan. Setiap milestone punya _definition of done_ yang bisa diverifikasi pemilik produk dengan menjalankan perintah dan melihat hasilnya.

---

# ⇥ MULAI DARI SINI

> Bagian ini untuk agen/pengembang yang baru masuk ke proyek ini.
> Diperbarui 13 Agustus 2026.
>
> **Perhatian: ada migration yang belum tentu sudah dijalankan.**
> `0003_idempotency.sql` menambah tabel `idempotency_keys`. Jalankan
> `pnpm db:migrate` sebelum menguji `POST /api/onboarding` — tanpa tabel itu,
> jalur sukses mengembalikan 500 (jalur guardrail tetap jalan, karena tidak
> menyentuh database sama sekali). M5 tidak menambah migration.
>
> **Yang paling mungkin bikin bingung di M5:** `WA_APP_SECRET` masih kosong di
> `.env.local`, dan tanpa itu webhook menolak SEMUA request dengan 401 — termasuk
> simulator, yang menandatangani payloadnya sendiri. Isi dengan string bebas apa
> pun untuk kerja lokal; nilai aslinya baru perlu saat menyambung ke Meta.

## Sudah selesai

| Milestone | Status | Commit |
| --- | --- | --- |
| M0 — Scaffolding & tooling | ✅ selesai | `4d7c3fe` |
| M1 — Skema database & seed | ✅ selesai | `6ed1d3e` |
| M2 — Nutrition engine & guardrail | ✅ selesai | `499a66f` |
| M3 — Onboarding & plan reveal | ✅ selesai | `60b1b5c` + perbaikan `31c9f2f` |
| M4 — Landing page | ✅ selesai | `42418a3` |
| M5 — Webhook WhatsApp, queue, pairing, text logging | ✅ selesai | `d8230a0` + `(5/n)` |

Aturan urutan sudah terpenuhi: engine lulus test, jadi UI boleh dikerjakan.

## Menguji WhatsApp tanpa nomor asli

Approval Meta belum ada, dan seluruh alur tetap bisa dijalankan. Simulator
membangun payload berbentuk Meta, menandatanganinya dengan HMAC yang sama, lalu
mengirimkannya ke handler webhook yang sama — tidak ada jalur pintas. Yang
diganti cuma pengiriman balasan: alih-alih ke Graph API, isinya dikembalikan di
respons.

```bash
# Isi WA_APP_SECRET di .env.local dengan string bebas dulu, lalu `pnpm dev`.
curl -s localhost:3000/api/dev/wa-simulator -H 'content-type: application/json' \
  -d '{"waId":"628123456789","text":"MULAI-XXXXXX"}'

curl -s localhost:3000/api/dev/wa-simulator -H 'content-type: application/json' \
  -d '{"waId":"628123456789","text":"Tadi gue makan nasi sama ayam geprek"}'

# Tombol: id-nya ada di `outbound[].buttons` dari respons sebelumnya.
curl -s localhost:3000/api/dev/wa-simulator -H 'content-type: application/json' \
  -d '{"waId":"628123456789","buttonId":"log:confirm:<logId>"}'
```

`{"drain":false}` menghentikannya setelah enqueue, kalau yang ingin dilihat cuma
handler webhooknya. Endpoint ini **404 di produksi** — ia menyuntik pesan atas
nama nomor mana pun tanpa melewati Meta.

## Cara menjalankan proyek ini

```
pnpm install
pnpm dev            # Next.js di http://localhost:3000
pnpm typecheck      # 7 package lewat turbo
pnpm lint           # eslint di root, termasuk aturan batas dependency
pnpm test           # vitest
pnpm test:coverage  # + ambang coverage 100% pada packages/core/src/nutrition
pnpm build
pnpm format         # prettier --write   ·   pnpm format:check untuk CI
pnpm db:migrate     # idempoten, aman diulang
pnpm db:seed        # idempoten, aman diulang
```

Gerbang sebelum commit: `format:check`, `typecheck`, `lint`, `test:coverage`, `build` — semuanya harus hijau. Itu juga isi `.github/workflows/ci.yml`.

## Jebakan lingkungan yang sudah diketahui

Ini semua sudah pernah memakan waktu. Jangan diulang.

1. **pnpm tidak ada di PATH.** Terpasang di `%APPDATA%\npm` tapi direktori itu belum masuk user PATH. Di sesi baru mungkin belum dikenali — pakai path penuh atau tambahkan sendiri ke PATH.
2. **`DIRECT_URL` bukan koneksi langsung.** Host `db.<ref>.supabase.co` IPv6-only dan **tidak resolve** dari jaringan IPv4 — DNS gagal, TCP tidak terjangkau. `.env.local` memakai **session pooler** (host pooler, port 5432) yang mendukung DDL. Jangan "perbaiki" kembali ke `db.<ref>...`.
3. **`DATABASE_URL` wajib berakhiran `?pgbouncer=true`.** Transaction pooler tidak mendukung prepared statement.
4. **Password Supabase tidak memakai kurung siku.** `[...]` di dashboard itu penanda placeholder, bukan bagian password.
5. **Sertifikat TLS belum diverifikasi.** Supabase memakai CA sendiri; `packages/db/src/client.ts` mencetak peringatan setiap kali. Menutupnya: unduh CA di Dashboard → Project Settings → Database → SSL Configuration, lalu set `DATABASE_CA_CERT_PATH` di `.env.local`. **Wajib sebelum pengguna nyata.**
6. **Kolom `date` di-parse sebagai string, bukan `Date`.** Disetel di `client.ts`. Jangan dikembalikan — driver menggeser tanggal mundur sehari saat serialisasi ke UTC dari WIB, dan `local_date` adalah sumbu semua rekap harian.
7. **Prettier tidak menyentuh `*.md`, `docs/`, `design/`, dan `**/__snapshots__/`.** Bukan kelalaian: prettier pernah merusak blok token CSS di CLAUDE.md dan membuat snapshot JSON gagal cocok.
8. **Pesan commit lewat file (`git commit -F`), bukan `-m`.** PowerShell memecah argumen pada tanda kutip ganda di dalam pesan.
9. **`.env.local` di-gitignore, `.env.example` tidak.** Jangan pernah menaruh nilai asli di `.env.example`.
10. **Next tidak memuat `.env.local` dari root monorepo.** File env-nya ada di root (dipakai bersama web, worker, migration, seed), sedangkan Next hanya membaca env file di direktori app-nya sendiri. Akibatnya `pnpm dev` jalan dan halaman render normal, tapi setiap endpoint yang menyentuh database gagal validasi env di `@bodycoach/db` — `DATABASE_URL` kosong. Sekarang script `dev`/`build`/`start` di `apps/web/package.json` memuatnya lewat `node --env-file-if-exists=../../.env.local` sebelum memanggil `next`. **`loadEnvConfig` di `next.config.ts` tidak cukup** — sudah dicoba, route handler berjalan di proses terpisah yang tidak mewarisi `process.env` hasil pemuatan di config (dan `import.meta.url` di next.config menunjuk ke lokasi transpile sementara, bukan `apps/web`).

## Yang berbeda dari teks milestone di bawah

Teks M0–M2 di bawah sengaja dibiarkan apa adanya sebagai catatan rencana awal. Yang benar-benar dibangun berbeda di beberapa titik:

- **`eslint.config.mjs`, bukan `.eslintrc.cjs`** — ESLint 9 memakai flat config.
- **`lint` dan `test` jalan di root**, bukan per package lewat turbo. Aturan batas dependency itu lintas package, jadi dievaluasi dari satu konfigurasi. `typecheck`/`build`/`dev` tetap lewat turbo.
- **Kode ada di `packages/*/src/`**, bukan `packages/core/nutrition/` seperti tertulis di M2.
- **Skema menambahkan `citext`** (§3 memakai tipenya tapi tidak mencantumkan ekstensinya) dan **memberi nama eksplisit pada semua index**.
- **RLS lebih ketat dari §3**: `link_tokens` dan `ai_usage` juga dikunci (RLS aktif tanpa policy — hanya service role). `target_versions` tidak punya policy UPDATE/DELETE, jadi **AD-4 ditegakkan database**, bukan hanya kode.
- **Engine tidak membaca jam** — `computeTargets(profile, currentYear)`.
- **`estimateTimeline` mengembalikan `null`** untuk laju nol (rumus §4.2 menghasilkan `Infinity` untuk maintain).
- **Kalori dinaikkan bila protein + lemak minimum melebihinya.** Rumus §4.2 melanggar invariant §4.4 untuk berat tinggi pada tubuh pendek. Ditemukan property test.
- **`validateGoal` mengumpulkan semua warn**, tidak berhenti di yang pertama (§4.3 menutupi `medical_flag` dengan `extreme_delta`).

## Utang yang belum dibayar

- [ ] **Nilai gizi 50 makanan masih `source=manual`, `verified=false`.** Konsisten secara internal (seed menolak baris yang makronya tidak menjelaskan kalorinya) tapi **belum dicocokkan dengan TKPI**. Ini fondasi L1 Truth. Wajib diverifikasi sebelum pengguna nyata. **Sejak M4 angka-angka ini tampil di halaman publik** — landing merender dua belas di antaranya. Prioritasnya naik: yang belum terverifikasi kini jadi klaim ke calon pengguna, bukan lagi data internal.
- [ ] **Isi Kebijakan Privasi, Syarat & Ketentuan, dan Hubungi kami belum ditulis.** Halamannya ada (`/privasi`, `/ketentuan`, `/kontak`) dan menyatakan dokumennya sedang disiapkan. Produk yang memproses data kesehatan tidak boleh dibuka untuk umum tanpa kebijakan privasi yang nyata.
- [ ] **Skor Lighthouse landing belum pernah diukur.** Target DoD M4: performance ≥ 90, accessibility ≥ 95, LCP < 2,5 detik di 4G. Butuh Chrome; tidak tersedia di mesin ini.
- [ ] **`docs/02-technical-spec.md` §4.4 salah di dua vektor uji BMR.** Pria 25th 70kg 175cm = **1674** (§4.4 menulis 1673, itu pembulatan ke bawah padahal §4.2 memakai `Math.round`). Wanita 25th 55kg 160cm = **1264** (§4.4 menulis 1257; selisih 7 kkal tidak dapat dijelaskan pembulatan). Rumus §4.2 yang dipakai kode. Perbaiki dokumennya.
- [ ] **Index `ivfflat` dibangun saat tabel kosong**, jadi klasternya tidak berguna. Wajib `REINDEX` setelah embedding terisi di M6.
- [ ] **`DATABASE_CA_CERT_PATH` belum diset** (lihat jebakan no. 5).
- [ ] **Status CI di GitHub belum pernah diperiksa.** Repo privat dan `gh` belum login di mesin ini.
- [ ] **ER diagram `docs/01-system-design.md` §5 menyebut tabel `conversations`** yang tidak ada di §3; `messages` menempel langsung ke `users`. §3 yang dipakai. Rapikan salah satunya.

Ditambahkan di M5:

- [ ] **Kredit MiniMax habis (402/1008).** Jalur coach LLM belum pernah berhasil dipanggil sekali pun — yang terverifikasi live justru fallback-nya. Sampai kredit diisi, produk berjalan dengan balasan template deterministik: benar dan berguna, tapi bukan yang dijual.
- [ ] **Belum ada `vercel.json` dengan cron ke `/api/worker/drain`.** Tanpa itu antrean tidak pernah dikuras di produksi dan tidak ada balasan yang terkirim. Latensi balasan = jeda cron; Vercel Hobby hanya mengizinkan cron harian, jadi ini juga keputusan paket. Untuk sekarang endpointnya bisa dipanggil manual dengan `Authorization: Bearer $WORKER_DRAIN_SECRET`.
- [ ] **Batas Free belum ditegakkan.** `LIMITS.free.foodLogsPerDay = 3` (§9) belum diperiksa di mana pun; `countLogsOnDate` sudah ada tapi belum dipanggil. Pengguna Free saat ini mencatat tanpa batas.
- [ ] **`ai_usage` belum diisi dari jalur coach.** Biaya per pesan tidak tercatat, jadi `cost.guard` (§8) tidak punya bahan dan cap harian `AI_DAILY_COST_CAP_IDR` belum berarti apa-apa.
- [ ] **"Ubah porsi" membuang log lalu meminta pengguna mengetik ulang.** Itu dua ketukan, bukan satu, dan tidak mengikuti janji "dapat dikoreksi satu ketukan" di DoD M6. Perbaiki bersama koreksi item di M6.
- [ ] **Handshake webhook GET belum pernah dijalankan terhadap Meta.** Hanya diuji lewat unit test.

## Perbaikan M3 setelah review (11 Agustus 2026)

M3 lolos semua gerbang CI tapi **belum pernah dijalankan di browser**. Empat bug
di bawah semuanya mati dalam 30 detik pemakaian manual. Pelajarannya bukan soal
kodenya — `format:check`, `typecheck`, `lint`, `test`, dan `build` hijau bukan
bukti bahwa produknya jalan.

| # | Bug | Perbaikan |
| --- | --- | --- |
| 1 | `router.push('/onboarding/rencana')` → **404**. `(onboarding)` adalah route group; segmen dalam kurung tidak masuk URL, jadi halamannya dilayani di `/rencana`. Alur mati tepat setelah rencana tersimpan. | Semua path pindah ke konstanta `apps/web/lib/routes.ts`, dijaga `routes.test.ts` yang mencocokkannya dengan `page.tsx` yang benar-benar ada. |
| 2 | Token pairing yang dikembalikan ke klien **bukan** token yang di-`INSERT` — hasil `insertToken()` dibuang di jalur sukses. Pairing M5 mustahil berhasil. | `createUniqueLinkToken` di `@bodycoach/db` mengembalikan baris hasil INSERT; route memakai `row.token`. Tabrakan ditangani `SAVEPOINT` (retry tanpa savepoint hanya menghasilkan "current transaction is aborted"). |
| 3 | `StepCalculating` memakai `useState(() => …)` sebagai pengganti `useEffect`: timer dimulai saat render, cleanup-nya jadi nilai state dan tidak pernah dipanggil. | Pindah ke `useEffect`. Prop `onDone` yang tidak pernah berfungsi dihapus — yang mengakhiri layar itu respons server. |
| 4 | Tombol **"Pilih Maintain"** di layar guardrail mengirim ulang state lama (stale closure di `setTimeout`), jadi diblokir guardrail yang sama lagi. | `submit(state)` menerima state sebagai argumen; `onChooseMaintain` membentuk state barunya lalu mengirimnya langsung. |

Ikutan yang diperbaiki bersamaan:

- **`Idempotency-Key` sekarang benar-benar dipakai.** Sebelumnya hanya dicek
  panjangnya lalu dibuang, padahal komentarnya mengklaim sebaliknya — retry
  menggandakan user, profile, target, dan token. Migration `0003_idempotency.sql`
  menambah tabel `idempotency_keys`; klaim dan respons commit dalam transaksi
  yang sama, jadi kegagalan di tengah melepas kuncinya kembali.
- **`estimateTimeline` tidak lagi ditulis ulang di UI.** Versi lokal di
  `rencana/page.tsx` mengeraskan konstanta `TIMELINE_SPREAD` dan mengembalikan
  `{0,0}` untuk maintain — persis yang membuat kartu rencana menampilkan
  "Perkiraan 0 minggu". Sekarang dihitung engine di server dan dikirim sebagai
  `plan.timeline` (`null` untuk maintain). AD-1 berlaku juga untuk angka durasi.
- **`getPool().end()` di handler error dihapus.** Satu kegagalan DB menutup pool
  bersama untuk seluruh proses; request berikutnya mati dengan "cannot use a
  pool after end".
- **Pesan Postgres mentah tidak lagi sampai ke pengguna** — detail ke log server,
  pengguna dapat kalimat yang memberi jalan keluar.
- **Consent data kesehatan divalidasi server-side** (`z.literal(true)`).
  Sebelumnya server menulis `consent_health_data_at` tanpa syarat dan klien tidak
  pernah mengirim flag-nya.
- **Posisi langkah ikut dipulihkan setelah refresh** (dijepit ke langkah pertama
  yang belum terjawab), bukan cuma jawabannya.
- **`toFixed` manual di `PlanCard` diganti `formatWeeklyRate`**; `MacroBar`
  memakai `formatInt`. Aturan "semua angka lewat helper `id-ID` terpusat".
- **Test naik dari 83 ke 105.** Yang baru: 15 test kontrak untuk
  `POST /api/onboarding` (dengan `@bodycoach/db` di-mock, engine tidak di-mock),
  6 test rute, 1 test consent. `vitest.config.ts` sebelumnya tidak memindai
  `apps/web/app/` sama sekali — seluruh API route diam-diam tidak pernah dites.

Sekalian ditemukan saat verifikasi live: **Next tidak pernah membaca `.env.local`
di root monorepo**, jadi jalur sukses `POST /api/onboarding` mustahil berhasil
lewat `pnpm dev` sejak awal. Lihat jebakan lingkungan no. 10.

**Bukti verifikasi live** (dev server + Supabase nyata, bukan mock):

- `GET /onboarding`, `/rencana`, `/sambungkan` → **200**; `/onboarding/rencana`
  dan `/onboarding/sambungkan` → **404** (path yang dipakai kode lama).
- Guardrail: wanita 170cm 48kg target 45kg → `{"kind":"blocked","reason":"cut_underweight"}`,
  tanpa satu digit pun, tanpa menyentuh database.
- Sukses: pria 175cm 70→78kg bulk → `kcal 2990, P126 K435 L83, 0,245 kg/minggu,
  timeline 28–44 minggu`, `linkToken MULAI-7VFXVC`.
- Token itu **ada di `link_tokens`** (1 baris, user yang sama) — inilah yang
  dulu tidak pernah cocok.
- Replay dengan `Idempotency-Key` sama → respons identik, dan di database tetap
  **1 user, 1 `target_versions`, 1 token**.
- `profiles.consent_health_data_at` terisi; `target_versions.reason = onboarding`,
  `effective_from = 2026-08-11` WIB.

**Sisa satu langkah manual:** klik-melalui alur 10 langkah di browser pada
viewport 390px (DoD "tanpa scroll horizontal" dan "seluruh alur tanpa mouse"
belum diverifikasi ulang setelah perubahan ini). Ada juga satu baris data uji di
database dari verifikasi di atas — hapus dengan menghapus user pemilik token
`MULAI-7VFXVC` bila mengganggu (cascade akan ikut membersihkan profil, target,
dan tokennya).

---

**Status desain:** keempat layar sudah jadi dan token sudah diverifikasi di CLAUDE.md. Layar yang belum didesain dan harus dibuat mengikuti sistem yang sama: Riwayat, Akun & Pengaturan, halaman Pro/paywall penuh, halaman Laporan Mingguan yang bisa dibagikan, dan kartu berbagi 4:5.

**Aturan urutan yang tidak boleh ditukar:** M2 (nutrition engine + guardrail) selesai dan lulus test **sebelum** menyentuh UI apa pun. Engine adalah fondasi kepercayaan produk ini; UI yang cantik di atas angka yang salah adalah kerugian bersih.

**Jalur kritis di luar kode:** verifikasi Meta Business + pengajuan 4 template WhatsApp. Mulai sekarang, paralel dengan M0. Ini bisa makan berminggu-minggu dan memblokir M5 sampai M9.

---

## M0 — Scaffolding & tooling ✅ SELESAI (`4d7c3fe`)

> Semua DoD terpenuhi kecuali "CI hijau di GitHub", yang belum bisa diperiksa karena repo privat dan `gh` belum login. Aturan batas dependency sudah **dibuktikan** memblokir: SDK vendor, package workspace lain, framework, Node builtin, dan jalur relatif tembus semuanya ditolak lint, lalu file buktinya dihapus.

**Tujuan:** repo yang bisa dijalankan, dites, dan di-typecheck dalam satu perintah.

**File**

```
package.json, pnpm-workspace.yaml, turbo.json
tsconfig.base.json + tsconfig per package
.eslintrc.cjs (termasuk aturan batas dependency), .prettierrc
.env.example  (sesuai docs/02-technical-spec.md §2)
.github/workflows/ci.yml
apps/web/ (Next.js 15, App Router, kosong)
apps/worker/ (kosong)
packages/{core,db,ai,whatsapp,ui}/ (kosong + index.ts)
README.md
```

**Definition of done**

- `pnpm install && pnpm typecheck && pnpm lint && pnpm test` lolos semua.
- `pnpm dev` membuka Next.js di localhost.
- Lint **gagal** kalau `packages/core` mengimpor sesuatu dari `apps/` atau `packages/db`. Buktikan dengan menambah import ilegal sementara, tunjukkan errornya, lalu hapus.
- CI hijau di GitHub.
- Bagian "Perintah" di CLAUDE.md diperbarui dengan perintah yang benar-benar jalan.

**Risiko:** aturan batas dependency di ESLint sering dikonfigurasi setengah jalan dan tidak benar-benar memblokir. Wajib dibuktikan, bukan diasumsikan.

---

## M1 — Skema database & seed ✅ SELESAI (`6ed1d3e`)

> Semua DoD terverifikasi terhadap Supabase nyata. Trigram: `name_id % 'nasi pdang'` mengembalikan **Nasi Padang** teratas (similarity 0,643). RLS: user A hanya melihat barisnya sendiri, `anon` ditolak sepenuhnya. `UNIQUE(user_id, effective_from)` menolak duplikat dengan kode 23505. Di database: 50 makanan, 171 alias, 102 porsi. `db:migrate` dan `db:seed` idempoten, sudah diuji tiga kali berturut-turut.

**Tujuan:** database berjalan dengan skema lengkap, RLS aktif, dan cukup data makanan untuk mengetes alur.

**File**

```
packages/db/migrations/0001_init.sql   (persis docs/02-technical-spec.md §3)
packages/db/migrations/0002_rls.sql
packages/db/src/client.ts, repositories/
data/seeds/food/foods.csv, aliases.csv, portions.csv
packages/db/src/seed.ts
```

**Isi seed:** 50 makanan Indonesia paling umum untuk M1 (nasi putih, ayam geprek, rendang, telur dadar, tempe goreng, tahu goreng, mie ayam, bakso, nasi goreng, Indomie goreng, soto ayam, gado-gado, sate ayam, martabak manis, kopi susu, dst) — masing-masing dengan minimal 3 alias dan 2 definisi porsi. Target 300 makanan dikerjakan bertahap sampai M7.

**Definition of done**

- `pnpm db:migrate && pnpm db:seed` berhasil dari database kosong.
- `pnpm db:migrate` dijalankan dua kali tidak error (idempoten).
- Query uji: `SELECT * FROM food_items WHERE name_id % 'nasi pdang'` mengembalikan Nasi Padang (trigram bekerja).
- Uji RLS: query sebagai user A tidak mengembalikan baris milik user B. Tunjukkan outputnya.
- Constraint `target_versions UNIQUE(user_id, effective_from)` terbukti mencegah duplikat.

**Risiko:** RLS sering dinyalakan tanpa policy, sehingga semua query mengembalikan kosong dan orang menyerah lalu mematikannya. Tulis policy bersamaan dengan `ENABLE ROW LEVEL SECURITY`, jangan terpisah.

---

## M2 — Nutrition engine & guardrail ✅ SELESAI (`499a66f`)

> 67 test lolos, coverage **100%** pada `packages/core/src/nutrition` (ditegakkan sebagai ambang di `vitest.config.ts`, dijalankan CI lewat `pnpm test:coverage`). Property test **10.000 profil acak** dengan seed tetap: semua invariant §4.4 terpenuhi. Snapshot 20 profil referensi di `packages/core/src/nutrition/__snapshots__/reference-profiles.json` — **jangan diperbarui tanpa menaikkan `ENGINE_VERSION`**, snapshot itu kontrak yang menjaga target lama tetap bisa dijelaskan asal-usulnya.
>
> Hasil verifikasi manual lima profil PLAN.md:
>
> | Profil | Hasil |
> | --- | --- |
> | Pria 22th 175cm 63kg bulk→70kg gym 4x | 2.882 kkal · P113 K428 L80 · +0,22 kg/mgg · 27–43 minggu |
> | Pria 28th 178cm 85kg cut→75kg gym 3x | 2.242 kkal · P165 K256 L62 · −0,64 kg/mgg · 13–21 minggu |
> | Wanita 25th 160cm 60kg cut→55kg gym 3x | 1.391 kkal · P121 K139 L39 · −0,45 kg/mgg |
> | Wanita 20th 170cm 48kg cut→45kg | **DIBLOKIR** `cut_underweight`, tanpa angka apa pun |
> | Pria 30th 172cm 70kg maintain | 2.624 kkal = TDEE 2.624 |

**Tujuan:** angka target yang deterministik, teruji, dan aman.

**File**

```
packages/core/nutrition/{constants,bmr,targets,timeline,recalibration}.ts
packages/core/nutrition/guardrail.ts
packages/core/nutrition/*.test.ts
packages/core/nutrition/__snapshots__/reference-profiles.json
```

Implementasi persis mengikuti `docs/02-technical-spec.md` §4. Fungsi murni, tanpa I/O, tanpa dependency eksternal.

**Definition of done**

- `pnpm test packages/core/nutrition` lolos 100%, coverage 100% pada modul ini.
- Snapshot 20 profil referensi tersimpan dan stabil.
- Property test 10.000 profil acak: semua invariant terpenuhi (kcal ≥ floor, kcal ≥ BMR×1.05, karbo tidak pernah negatif, protein ≤ 2.6 g/kg).
- `validateGoal()` mengembalikan `block` tanpa angka kalori untuk: BMI 17.2 + cut, target BMI < 18.5, arah goal tidak cocok.
- **Verifikasi manual pemilik produk** — tampilkan tabel hasil untuk 5 profil ini:

| Profil                                       | Ekspektasi kasar                 |
| -------------------------------------------- | -------------------------------- |
| Pria 22th, 175cm, 63kg, bulk → 70kg, gym 4x  | surplus moderat, protein ~113g   |
| Pria 28th, 178cm, 85kg, cut → 75kg, gym 3x   | defisit moderat, protein ~165g   |
| Wanita 25th, 160cm, 60kg, cut → 55kg, gym 3x | tidak boleh di bawah 1200 kkal   |
| Wanita 20th, 170cm, 48kg, cut → 45kg         | **harus ter-block, tanpa angka** |
| Pria 30th, 172cm, 70kg, maintain             | kkal ≈ TDEE                      |

**Risiko:** godaan mempercepat dengan melewati property test. Jangan. Bug di sini baru terlihat berbulan-bulan kemudian, saat sudah ada data pengguna yang tidak bisa diperbaiki.

---

## M3 — Onboarding & plan reveal ✅ SELESAI

> **Bukti DoD:**
>
> - 83 test lulus (67 engine + 16 UI/onboarding baru), coverage nutrition 100%.
> - `format:check`, `typecheck` (7 paket), `lint`, `test:coverage`, `build` — semua hijau.
> - API guardrail dites manual via curl: wanita 170cm 48kg target 45kg → `{kind:"blocked",reason:"cut_underweight"}` (tidak ada angka sama sekali).
> - Build menghasilkan 4 halaman: `/onboarding` (4,91 kB), `/rencana` (1,03 kB), `/sambungkan` (1,80 kB), `/` placeholder; `/api/onboarding` sebagai dynamic API route.
>
> **Penyimpangan dari teks asli** (dilaporkan, bukan diperbaiki kembali):
>
> - Route `rencana` dan `sambungkan` dipisah jadi dua halaman (desain asli menampilkannya berurutan dalam satu kanvas). Dipisah agar PlanCard tidak re-render saat state sambungkan berubah, dan agar masing-masing bisa diuji sebagai unit.
> - `displayName` ada di state wizard tapi tidak dipakai di input — engine tidak butuh dan API Zod menerimanya nullable untuk fleksibilitas M7 (akun login).
> - `link_tokens` di-generate server-side dengan format `MULAI-XXXXXX` (alfanumerik tanpa ambiguous chars). Disimpan ke sessionStorage `bodycoach.lastResult.v1` agar `/sambungkan` bisa membacanya tanpa query param.
> - Format `MULAI-<6 char>` (6, bukan 4) supaya collision probability turun ke ~1,1 miliar untuk 1 juta token. Sesuai rencana M5.
> - Effective-from target dipakai `Asia/Jakarta` lewat `Intl.DateTimeFormat`, bukan `Date.now()` UTC (konsisten dengan `client.ts` note tentang `local_date`).

**Tujuan:** pengguna baru bisa menyelesaikan 10 langkah dan melihat rencana personalnya.

**Sumber desain:** `design/Onboarding.dc.html`, `design/Rencana-_-WhatsApp.dc.html`

`Rencana-_-WhatsApp.dc.html` memakai format runtime Claude Design (`<x-dc>`, `<sc-if>`, binding `{{ }}`, `./support.js`). File itu **tidak bisa dijalankan atau disalin langsung** — baca sebagai spesifikasi, bangun ulang sebagai React. `Onboarding.dc.html` HTML biasa dan bisa dibuka di browser sebagai pembanding visual.

**Terapkan keputusan konflik dari CLAUDE.md:** warna makro Protein hijau / Karbo kuning / Lemak biru, dan tambahkan token `--iron-300`, `--iron-400`, `--plate-yellow-ink`.

**File**

```
packages/ui/tokens.css, tailwind preset
packages/ui/components/{Button,GoalCard,Stepper,Slider,Chip,ProgressBar,PlanCard,MacroBar}
apps/web/app/(onboarding)/…   10 langkah + consent + layar menghitung + layar guardrail
apps/web/app/api/onboarding/route.ts
apps/web/app/(onboarding)/rencana/page.tsx
```

**Definition of done**

- Alur lengkap bisa diselesaikan di viewport 390px tanpa scroll horizontal.
- Tombol lanjut nonaktif sampai input valid; tombol kembali mempertahankan jawaban sebelumnya.
- Refresh di tengah alur tidak menghilangkan jawaban.
- Layar guardrail muncul untuk profil wanita 170cm target 45kg, **tanpa angka kalori apa pun**, dengan tombol "Ubah target" dan "Pilih Maintain".
- Checkbox consent data kesehatan terpisah, tidak dicentang otomatis; `consent_health_data_at` tersimpan.
- `POST /api/onboarding` membuat `profiles` + `target_versions` v1 + `link_tokens`, mengembalikan deep link `wa.me`.
- Semua angka gizi memakai font mono tabular.
- Keyboard: seluruh alur dapat diselesaikan tanpa mouse, focus ring terlihat di setiap kontrol.
- Laporkan setiap penyimpangan dari file desain beserta alasannya.

**Risiko:** komponen dibangun sekali pakai per layar, bukan sebagai design system. Semua komponen di atas harus ada di `packages/ui/`, bukan di dalam folder halaman.

---

## M4 — Landing page ✅ SELESAI

> **Bukti DoD** (dev server + Supabase nyata):
>
> - 134 test lulus (naik dari 105). Baru: `pricing.test.ts` (4), `landingFoods.test.ts` (14), `formatIdr` (1), rute bertambah 3.
> - `format:check`, `typecheck` (7 paket), `lint`, `test`, `build` — semua hijau.
> - Rute 200: `/`, `/onboarding`, `/rencana`, `/sambungkan`, `/privasi`, `/ketentuan`, `/kontak`.
> - Kartu makanan dirender dari database: Nasi Padang ±735, Ayam geprek ±342, Rendang daging sapi ±174, Mie ayam ±508, Bakso ±350, Nasi goreng ±372, Mie instan goreng ±438, Soto ayam ±245, Gado-gado ±420, Martabak manis ±1.024, Es kopi susu ±163, Sate ayam ±500. Bandingkan dengan placeholder desain (Nasi Padang ±870) — selisihnya besar, dan inilah alasan aturannya ada.
> - Percakapan contoh juga dari database: "Estimasi ±735 kkal, 28g protein", bukan "±870 kkal, 38g protein" seperti di markup desain.
> - Harga dari `PRICING`: Rp0 / Rp39.000 / Rp299.000, "Hemat 36%" dihitung.
> - `<html lang="id">`, disclaimer wellness ada di footer, Open Graph lengkap termasuk kartu berbagi 1200x630 yang di-generate (`/opengraph-image`, 200, image/png).
> - Tidak ada request ke fonts.googleapis.com — ketiga font di-self-host lewat `next/font`.
> - `目标` dan `następ` nol kemunculan di HTML hasil render.
>
> **Belum terverifikasi, butuh browser sungguhan:** skor Lighthouse mobile (performance ≥ 90, accessibility ≥ 95) dan LCP < 2,5 detik di 4G tersimulasi. Tidak ada Chrome/Lighthouse di mesin ini. Struktur halaman sudah dibuat untuk itu (font self-hosted, tanpa gambar eksternal, tanpa JS pihak ketiga, komponen klien hanya CTA + accordion), tapi angkanya tetap **klaim yang belum diukur**. Ukur sebelum merilis.
>
> **Penyimpangan dari file desain** (dilaporkan, bukan dikoreksi diam-diam):
>
> - **Semua CTA "Mulai gratis" menuju `/onboarding`**, bukan anchor `#harga` seperti di desain. DoD menetapkan demikian; pengguna yang sudah memutuskan tidak perlu dipaksa lewat tabel harga.
> - **Kartu "Warteg" diganti "Rendang daging sapi".** Warteg itu jenis warung, bukan hidangan — tidak ada barisnya di food database, jadi tidak ada angka yang bisa dipertanggungjawabkan. Kalimat pengantar section tetap menyebut warteg.
> - **FAQ dibangun ulang dengan `aria-expanded`/`aria-controls`** dan animasi `grid-template-rows: 0fr→1fr`. Versi desain memakai `onclick` inline tanpa atribut ARIA, dan `max-height: 300px` yang memotong jawaban panjang tanpa peringatan.
> - **Font di-self-host lewat `next/font/google`**, bukan `<link>` ke fonts.googleapis.com. Stylesheet pihak ketiga itu render-blocking, dan halaman ini punya anggaran LCP.
> - **Placeholder foto di percakapan contoh digambar dengan CSS**, bukan `<img>` ke data URI SVG. Tidak ada aset palsu yang ikut ke produksi.
> - **Tiga tautan footer (`href="#"` di desain) menjadi halaman nyata** `/privasi`, `/ketentuan`, `/kontak` yang menyatakan dokumennya sedang disiapkan. Menautkan ke rute yang tidak ada menghasilkan 404 — persis bug yang baru diperbaiki di M3. Isi dokumennya keputusan pemilik produk, bukan sesuatu yang boleh dikarang di sini.
> - **Kartu berbagi memakai font default `ImageResponse`, bukan Archivo.** Menyuntikkan Archivo berarti mengambil file font saat build. Akibatnya judul di kartu tampil lebih tipis dari brand aslinya — perbaiki dengan mem-vendor file font kalau kartunya dianggap penting.
>
> **Bug tambahan di file desain yang ikut diperbaiki:** `class="chip-kkal"` di percakapan contoh tidak pernah cocok dengan CSS `.chip-kcal`, jadi gaya angka kalorinya diam-diam tidak berlaku (sejenis `.wa-banne` di konflik no. 7).
>
> **Jebakan yang ditemukan saat verifikasi:** `listFoodsWithDefaultPortion` mencocokkan lewat `name_id`, dan `name_id` untuk rendang adalah **"Rendang daging sapi"**, bukan "Rendang". Nama yang salah ketik tidak melempar error — ia hanya menghilangkan satu kartu tanpa suara. Sekarang dijaga `landingFoods.test.ts`, yang mencocokkan daftar nama langsung ke `data/seeds/food/foods.csv` tanpa perlu database.

**Sumber desain:** `design/Landing-Page.dc.html`

**Perbaikan wajib saat port:** ganti `"Setiap orang beda目标, strateginya beda."` menjadi `"Setiap orang beda tujuan, strateginya beda."`; harga diambil dari satu konstanta terpusat (Rp39.000 / Rp299.000), tidak di-hardcode; angka kalori pada kartu makanan dirender dari Indonesian Food Database, bukan ditulis di markup.

**Definition of done**

- Semua section ada, copy Bahasa Indonesia persis dari file desain.
- Lighthouse mobile: performance ≥ 90, accessibility ≥ 95.
- LCP < 2,5 detik pada koneksi 4G tersimulasi.
- CTA "Mulai gratis" mengarah ke `/onboarding` dan memicu event `landing.cta_clicked`.
- Disclaimer wellness ada di footer.
- Metadata Open Graph + kartu berbagi terisi (halaman ini akan dibagikan dari TikTok).
- Animasi hero menghormati `prefers-reduced-motion`.

---

## M5 — Webhook WhatsApp, queue, pairing, text logging ✅ SELESAI

> **Diverifikasi live 13 Agustus 2026** terhadap Supabase dan Upstash nyata,
> lewat simulator — jadi yang dijalankan adalah handler webhook yang sama,
> verifikasi HMAC yang sama, dan worker yang sama. Hasil per butir DoD:
>
> | DoD | Hasil |
> | --- | --- |
> | Signature tidak valid ditolak 401 | ✅ (11 test `signature.test.ts` + secret kosong menolak semuanya) |
> | Handler balas 200 < 300 ms | ✅ **17–66 ms** setelah koneksi hangat (159 ms pada request pertama, biaya TLS+pool). Diukur dari header `X-Handler-Ms`, bukan diklaim |
> | Replay identik 3× → satu `food_log` | ✅ dan **kedua lapisnya diuji terpisah**: replay ke-2 dihentikan dedup Redis, lalu kunci Redis dihapus sengaja dan replay ke-3 dihentikan unique constraint `source_message_id` (`{"kind":"duplicate"}`) |
> | Pairing `MULAI-<token>`, hangus setelah dipakai & 24 jam | ✅ pairing berhasil; token yang sama dikirim ulang → `already_used` |
> | "Tadi gue makan nasi ayam geprek" → dua item + makro dari DB | ✅ Nasi putih 150 g ±195 kkal P4 K42 L0 · Ayam geprek 120 g ±342 kkal P25 K14 L22, keduanya `match_stage=alias` |
> | Balasan berisi sisa target + tombol Catat/Ubah porsi/Batal | ✅ pesan interaktif, tiga tombol, "Kalau dicatat, sisa ±2.345 kkal · protein kurang 84g" |
> | Tiga pesan berurutan diproses berurutan | ✅ kunci Redis per nomor (`SET NX` + `EVAL` untuk melepas); job yang kuncinya dipegang dikembalikan ke antrean, tidak diproses paralel |
> | Gangguan makan → tanpa angka apa pun | ✅ `{"kind":"concern","severity":"eating_disorder"}`, balasan nol digit |
> | Angka balasan cocok 100% dengan engine | ✅ jalur pencatatan **tidak melewati LLM sama sekali** (lihat keputusan di bawah) |
>
> **Keputusan yang layak diingat**
>
> - **Jalur pencatatan makanan sepenuhnya deterministik.** LLM tidak menyusun
>   kalimatnya. Ini jalur yang paling sering dilewati dan paling padat angka;
>   membuatnya tidak pernah menyentuh model berarti verifikasi §6.4 tidak punya
>   apa pun untuk gagal di sana. LLM dipakai untuk pertanyaan bebas, dan di sana
>   verifikasi + fallback template berlaku penuh.
> - **Log dibuat berstatus `pending`, bukan `confirmed`.** Yang memasukkannya ke
>   hitungan harian adalah tombol "Catat". Kalau langsung `confirmed`, ketiga
>   tombol itu tidak punya arti, dan angka di WhatsApp berbeda dari angka di
>   dashboard sampai tombolnya ditekan. Karena itu sisanya ditulis bersyarat
>   ("kalau dicatat"), bukan sebagai fakta.
> - **Pertanyaan dipilah sebelum food resolver.** "Enaknya makan ayam geprek gak
>   ya?" akan dicocokkan resolver dan tercatat 342 kkal yang tidak pernah dimakan
>   siapa pun. Sama untuk "berat gue 70kg". Keduanya dipilah lebih dulu, dan
>   pemilahannya sengaja condong ke arah menahan pencatatan.
> - **Foto dijawab jujur** ("belum bisa gue baca, nyusul"), bukan didiamkan.
>   Analisis foto adalah M7.
>
> **Yang belum bisa diverifikasi, dan kenapa**
>
> - **Jalur coach LLM tidak pernah berhasil dipanggil**: MiniMax membalas
>   402/1008 — **saldo akun habis**. Yang justru terverifikasi live adalah
>   fallback-nya: provider mati → balasan template deterministik dengan angka
>   engine, pengguna tetap terjawab. Isi ulang kredit di platform.minimax.io
>   sebelum menganggap coach jalan.
> - **Belum pernah menyentuh Meta.** `WA_APP_SECRET` masih kosong; verifikasi di
>   atas memakai secret lokal. Handshake GET dan pengiriman nyata ke Graph API
>   belum pernah dijalankan sekali pun.
>
> **Keputusan yang sudah diambil (12 Agustus 2026)**
>
> - **Provider AI: MiniMax.** Model `MiniMax-M3` lewat antarmuka
>   OpenAI-compatible di `https://api.minimax.io/v1`. Satu model menangani teks
>   **dan** gambar, jadi coach (M5) dan analisis foto (M6) berbagi provider yang
>   sama — tidak perlu vendor vision terpisah. Embedding: `embo-01`.
> - **Tanpa SDK vendor**, hanya `fetch`. Empat bentuk request yang stabil tidak
>   sepadan dengan ratusan kilobyte dependensi.
> - **Deploy ke Vercel** untuk URL webhook. Meta butuh HTTPS publik; `APP_URL`
>   lokal tidak bisa dijangkau. Semua env var harus dipindah ke Vercel.
>
> **Sudah selesai** (`0366267`):
>
> - `packages/ai/providers/{types,minimax}.ts` — antarmuka netral vendor +
>   implementasi MiniMax. Dua jebakan sudah ditangani: MiniMax bisa membalas
>   HTTP 200 dengan kegagalan di `base_resp` (tanpa pemeriksaan, error kuota
>   terbaca sebagai balasan kosong), dan tool call bisa datang dengan JSON
>   cacat (yang cacat dibuang, sisanya dipakai).
> - `packages/ai/prompts/coach.v1.ts` — system prompt + 7 tool, persis §6.1–6.2.
> - `packages/ai/factory.ts` — pemilihan provider dari env, dibaca malas.
> - `packages/whatsapp/` — signature (HMAC atas body mentah, `timingSafeEqual`),
>   client Graph v21, builder interaktif dengan batas Meta, keempat template,
>   `extractMessages`.
> - 174 test lulus; tidak satu pun butuh kunci API.
>
> **Blokir yang masih butuh kamu:** `WA_APP_SECRET` kosong (isi string bebas
> untuk kerja lokal, nilai Meta untuk produksi) dan **kredit MiniMax habis**.

**Tujuan:** pengguna bisa menautkan WhatsApp dan mencatat makanan lewat teks.

**File**

```
apps/web/app/api/webhooks/whatsapp/route.ts
apps/web/app/api/dev/wa-simulator/route.ts     ← dev-only
packages/whatsapp/{client,templates,interactive}.ts
apps/worker/functions/message-received.ts
packages/core/coach/{context,tools,guardrail}.ts
packages/ai/prompts/coach.v1.ts
packages/ai/providers/*.ts
```

**Simulator wajib dibuat.** Approval Meta bisa berminggu-minggu; seluruh alur harus dapat dikembangkan dan dites tanpa nomor asli. Simulator meniru bentuk payload Meta, bukan API-nya.

**Definition of done**

- Request tanpa `X-Hub-Signature-256` valid ditolak 401.
- Handler membalas 200 dalam < 300 ms (ukur dan tunjukkan).
- Replay payload identik 3× menghasilkan **tepat satu** `food_log`.
- Pairing: kirim `MULAI-<token>` menautkan `wa_id` ke `user_id`; token hangus setelah dipakai dan setelah 24 jam.
- "Tadi gue makan nasi ayam geprek" menghasilkan log dengan dua item terpisah (nasi + ayam geprek) beserta makro dari database.
- Balasan menyertakan sisa target dan tombol interaktif Catat / Ubah porsi / Batal.
- Tiga pesan berurutan dari satu pengguna diproses berurutan (concurrency key = userId), tidak saling menimpa total harian.
- Guardrail: pesan yang mengindikasikan gangguan makan memicu `escalate_concern` dan **tidak menghasilkan angka apa pun**.
- Angka di balasan cocok 100% dengan hasil engine di golden test.

**Risiko:** menaruh pemanggilan AI di dalam handler webhook karena "lebih cepat dulu". Itu akan menyebabkan Meta timeout dan me-retry, lalu duplikasi log. Jangan.

---

## M6 — Food resolver & koreksi pengguna

**Tujuan:** pencocokan teks Indonesia ke makanan kanonik yang cukup akurat untuk dipercaya.

**File**

```
packages/core/food/{normalize,resolver,portion}.ts
apps/web/app/api/me/logs/[itemId]/route.ts
tooling/evals/food-matching/golden-200.json
```

Kaskade alias → trigram → vector → generic, sesuai `docs/02-technical-spec.md` §5. Berhenti di hit pertama.

**Definition of done**

- Golden set 200 kalimat Indonesia: akurasi top-1 ≥ 85%. Tunjukkan angkanya.
- Normalisasi menangani: `nasgor`, `geprek`, `indomie`, `setengah porsi`, `2 potong`, `seporsi`, `sebungkus`, dan salah ketik umum.
- Item dengan confidence < 0.75 ditandai "perlu dicek" dan dapat dikoreksi satu ketukan.
- Koreksi tersimpan ke tabel `corrections` beserta nilai sebelum-sesudah.
- Laporan mingguan koreksi bisa di-query: makanan mana yang paling sering salah.

**Risiko:** langsung lompat ke vector search untuk semua query. Mahal dan lambat. Tahap 1–2 harus menangani mayoritas kasus.

---

## M7 — Photo pipeline

**File**

```
apps/worker/functions/photo-analyze.ts
packages/ai/prompts/vision.v1.ts
packages/core/food/confidence.ts
tooling/evals/vision/50-photos/
```

**Definition of done**

- Media di-download, di-resize ke sisi terpanjang 1024px, di-hash SHA-256, disimpan di bucket privat.
- Foto identik (hash sama) tidak memanggil vision dua kali.
- Vision mengembalikan JSON sesuai skema; **tidak ada kalori** di output vision.
- Confidence gate bekerja di tiga jalur: ≥0.75 konfirmasi, 0.45–0.75 minta koreksi porsi, <0.45 minta ketik manual.
- Eval 50 foto makanan Indonesia: item recall dan error porsi median < 25%. Tunjukkan angkanya.
- Latency p95 < 9 detik; interim ack terkirim kalau proses > 2,5 detik.
- Foto bukan makanan ditangani dengan ramah, bukan error.
- Biaya per analisis tercatat di `ai_usage`.

---

## M8 — Dashboard & daily summary

**Sumber desain:** `design/Dashboard.dc.html`

File ini sudah berisi implementasi personalisasi di dalam `<script>` — baca fungsi `applyPersonalization()` sebagai spesifikasi, jangan mereka-reka ulang. Sudah termasuk dark mode; landing dan onboarding light-only.

**Perbaikan wajib saat port:** samakan warna makro dengan plan reveal (Protein hijau, Karbo kuning, Lemak biru — saat ini Dashboard memakai protein biru dan lemak merah); perbaiki nama class `.wa-banne`.

**File**

```
apps/web/app/(app)/dashboard/…
packages/ui/components/{PlateStack,WeightChart,StatTile,FoodLogItem,EmptyState}
apps/web/app/api/me/dashboard/route.ts
apps/worker/functions/{summary-daily,summary-rebuild,target-recalibrate}.ts
```

**Definition of done**

- Dashboard mencerminkan aktivitas WhatsApp dalam < 5 detik.
- Matriks personalisasi berfungsi — verifikasi tiap varian: per goal (bulk/cut/maintain), per waktu hari (5 rentang), per status target (5 tingkat), per lama pemakaian (hari 1–3, 4–14, 15+), per paket (free/pro), dan per data yang belum ada.
- Kondisi >110% target memakai warna merah **tetapi nada copy tetap tenang tanpa rasa bersalah**.
- `daily_summaries` bisa dibangun ulang penuh dari `food_log_items` dan hasilnya identik.
- Rekalibrasi mingguan hanya berjalan jika adherence ≥ 0.7, membuat `target_versions` baru (bukan update), dan mengirim penjelasan sebelum-sesudah.
- Grafik berat menonjolkan garis tren EMA, bukan titik harian.
- Setiap chart punya padanan teks untuk pembaca layar.

---

## M9 — Entitlement, pembayaran, paywall

**File**

```
packages/core/billing/entitlement.ts
apps/web/app/api/billing/{checkout,webhook}/route.ts
apps/web/app/(app)/pro/page.tsx
apps/worker/functions/{billing-dunning,cost-guard}.ts
```

**Definition of done**

- Limit Free ditegakkan di web dan WhatsApp (3 log/hari, 1 foto/hari, 10 pesan coach/hari, riwayat 7 hari).
- Pesan saat limit tercapai **tetap memberi nilai** sebelum menawarkan upgrade — tunjukkan teks persisnya.
- Checkout QRIS/e-wallet/VA berhasil di sandbox; webhook mengubah entitlement dalam < 10 detik.
- Webhook pembayaran idempoten; replay tidak menggandakan periode langganan.
- Pembayaran gagal → status `past_due`, akses Pro tetap sampai akhir periode, dunning berjalan.
- `cost.guard` mengaktifkan mode degradasi saat `ai_usage` melewati cap. Buktikan dengan cap sementara yang rendah.
- Tanpa hitung mundur palsu di paywall.

---

## Gerbang sebelum pengguna pertama

Tidak boleh ada pengguna nyata sebelum semua ini terpenuhi:

- [ ] Suite 40 prompt adversarial guardrail lolos **100%** (gangguan makan, defisit ekstrem, klaim medis, jailbreak).
- [ ] Golden test kecocokan angka: 100% angka di balasan berasal dari engine.
- [ ] Kill switch berfungsi: matikan vision, matikan proactive, mode read-only, pesan pemeliharaan.
- [ ] Endpoint hapus akun bekerja, termasuk objek di storage.
- [ ] Kebijakan privasi terbit, consent data kesehatan tersimpan per pengguna.
- [ ] Sentry + PostHog menerima event dari produksi.
- [ ] Template WhatsApp disetujui Meta dan sudah diuji terkirim.
- [ ] Biaya per pengguna diukur dari data nyata, bukan estimasi, dan dibandingkan dengan Rp39.000.

---

## Urutan rilis

1. **Internal** — founder + 3 teman, 1 minggu, satu nomor.
2. **Concierge** — 10–20 pengguna, mode approval: manusia memeriksa setiap balasan sebelum terkirim. Ini menghasilkan data koreksi terbaik dan menemukan kasus yang tidak terpikirkan.
3. **Closed beta** — 50–100 pengguna, otomatis penuh, feature flag per pengguna.
4. **Open beta** — daftar tunggu dibuka, quality rating WhatsApp dipantau harian.
