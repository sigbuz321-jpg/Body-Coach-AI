# Setup WhatsApp Cloud API

Dokumen serah-terima untuk yang mengurus Meta Business. Berisi persis apa yang
harus diisi, urutannya, dan arti tiap kegagalan.

Kode webhook-nya sudah jadi dan sudah diuji terhadap semua kasus di bawah
(`apps/web/app/api/webhooks/whatsapp/route.ts`). Yang belum ada cuma tokennya
dan pendaftaran URL-nya.

---

## 1. Access token — yang sekarang salah, dan kenapa

Token yang terpasang sekarang **sudah kedaluwarsa**:

```
GET /v21.0/<phone_number_id>
401 OAuthException 190/463
"Session has expired on Monday, 10-Aug-26 13:00:00 PDT"
```

Itu **token sementara 24 jam** dari halaman Getting Started — memang selalu
mati sehari setelah dibuat, jadi bukan sesuatu yang bisa diperpanjang.
Yang dibutuhkan adalah **System User token** yang tidak kedaluwarsa.

**Cara ambil:** Business Settings → Users → **System users** → pilih/ buat
system user dengan peran Admin → **Generate new token** → pilih aplikasi yang
sama dengan WhatsApp-nya → centang izin:

| Izin                            | Untuk apa                                |
| ------------------------------- | ---------------------------------------- |
| `whatsapp_business_messaging`   | mengirim dan menerima pesan              |
| `whatsapp_business_management`  | membaca konfigurasi nomor, kelola templat |

Set **Token expiration: Never**. Pastikan juga system user itu punya akses ke
**WhatsApp Account** yang benar (Business Settings → Accounts → WhatsApp
Accounts → Add People).

**Simpan ke `WA_ACCESS_TOKEN`** — di `.env.local` untuk lokal, dan di
Environment Variables Vercel untuk produksi. Keduanya, bukan salah satu.

Setelah diganti, cek benar-benar hidup:

```bash
curl -s "https://graph.facebook.com/v21.0/$WA_PHONE_NUMBER_ID?fields=display_phone_number,verified_name,quality_rating" \
  -H "Authorization: Bearer $WA_ACCESS_TOKEN"
```

HTTP 200 dengan nomornya = beres. Masih 401 = izin system user belum mencakup
WhatsApp Account-nya.

---

## 2. Webhook — Callback URL dan Verify Token

Ini yang ditanyakan tim WA.

| Kolom di Meta    | Isi                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| **Callback URL** | `https://body-coach-ai-web.vercel.app/api/webhooks/whatsapp`         |
| **Verify token** | nilai `WA_WEBHOOK_VERIFY_TOKEN` (ada di `.env.local`)               |
| **Fields**       | centang **`messages`** saja                                          |

> **Salin URL-nya persis, tanpa garis miring di ujung.** URL berakhiran `/`
> dibalas **308 redirect**, dan Meta tidak mengikuti redirect saat verifikasi —
> gagalnya muncul sebagai pesan generik yang tidak menyebut sebabnya. Domain
> saja tanpa path dibalas 200 tapi isinya HTML, bukan challenge, dan gagal
> dengan pesan yang sama.
>
> Endpoint ini **sudah diverifikasi hidup di produksi** pada 13 Agustus 2026:
> token benar → 200 dengan body `12345`, token salah → 403.

Tempatnya: Meta App Dashboard → **WhatsApp** → **Configuration** → Webhook →
Edit.

**Verify token itu string yang kita tentukan sendiri**, bukan sesuatu yang
diberikan Meta. Nilainya sudah ada di `.env.local` baris
`WA_WEBHOOK_VERIFY_TOKEN=`. Baca dengan:

```bash
grep WA_WEBHOOK_VERIFY_TOKEN .env.local
```

Yang harus sama persis: nilai yang diketik di form Meta dan nilai
`WA_WEBHOOK_VERIFY_TOKEN` di environment **server yang melayani URL itu**.
Beda satu karakter, verifikasi gagal.

### Urutannya tidak boleh dibalik

1. **Deploy dulu**, dengan `WA_WEBHOOK_VERIFY_TOKEN` **dan** `WA_APP_SECRET`
   sudah terisi di environment produksi.
2. Pastikan URL-nya hidup (lihat perintah verifikasi di bawah).
3. **Baru** isi form webhook di Meta lalu klik Verify and Save.

Meta memanggil Callback URL **saat tombol Verify ditekan**. Kalau URL-nya belum
ada, atau env-nya belum terisi di server, verifikasi gagal dengan pesan generik
yang tidak menyebut sebabnya.

### Verifikasi sendiri sebelum menyerahkan ke Meta

```bash
curl -i "https://<domain-produksi>/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<VERIFY_TOKEN>&hub.challenge=12345"
```

Yang benar: **HTTP 200** dengan body persis `12345`, tanpa tanda kutip, tanpa
JSON. Kalau yang keluar 403, berarti tokennya tidak cocok atau
`WA_WEBHOOK_VERIFY_TOKEN` belum ada di environment server.

---

## 3. Arti tiap kode kegagalan

Endpoint ini publik, jadi pesannya sengaja tidak menjelaskan apa pun ke
pemanggil. Tabel ini yang menjelaskannya ke kita.

| Kode                  | Sebab                                                                        | Perbaikan                                                        |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `403` di GET          | `hub.verify_token` beda, atau `WA_WEBHOOK_VERIFY_TOKEN` kosong di server      | samakan nilainya; cek env produksi, bukan cuma `.env.local`       |
| `401` di POST         | `X-Hub-Signature-256` tidak cocok, atau `WA_APP_SECRET` kosong di server      | isi `WA_APP_SECRET` dari App Dashboard → Settings → Basic         |
| `200` tapi tidak ada balasan | Antrean tidak pernah dikuras                                          | jalankan `/api/worker/drain` (lihat PLAN.md "Deploy ke Vercel")   |
| `401` dari Graph API  | Access token kedaluwarsa atau izinnya kurang                                  | System User token, lihat bagian 1                                 |

**`WA_APP_SECRET` sengaja menolak semuanya kalau kosong.** Endpoint webhook
bersifat publik; menerima request tanpa verifikasi tanda tangan dalam kondisi
belum dikonfigurasi jauh lebih berbahaya daripada menolak semuanya.

---

## 4. Env yang harus ada di produksi

Yang berhubungan dengan WhatsApp. Daftar lengkapnya di `.env.example`.

| Variabel                  | Dari mana                                              |
| ------------------------- | ------------------------------------------------------ |
| `WA_PHONE_NUMBER_ID`      | WhatsApp → API Setup                                    |
| `WA_BUSINESS_ACCOUNT_ID`  | WhatsApp → API Setup                                    |
| `WA_ACCESS_TOKEN`         | System User token (bagian 1)                            |
| `WA_APP_SECRET`           | App Dashboard → Settings → Basic → App Secret           |
| `WA_WEBHOOK_VERIFY_TOKEN` | ditentukan sendiri, harus sama dengan yang diisi di Meta |
| `WA_BUSINESS_NUMBER`      | nomor E.164 untuk deep link `wa.me`                     |

---

## 5. Yang belum diurus dan akan menghambat nanti

- **Empat templat pesan belum diajukan** — `ringkasan_harian`,
  `laporan_mingguan`, `pengingat_timbang`, `target_disesuaikan`. Definisinya
  sudah ada di `packages/whatsapp/src/templates.ts`. Templat wajib disetujui Meta sebelum
  bisa dipakai, dan persetujuannya bisa makan berhari-hari. Ini dibutuhkan M9
  (rekap harian di luar jendela 24 jam), bukan sekarang — tapi kalau
  pengajuannya menunggu sampai dibutuhkan, ia jadi jalur kritis.
- **Nomor masih mode uji.** Selama belum diverifikasi penuh, hanya nomor yang
  didaftarkan di daftar penerima uji yang bisa menerima pesan.
