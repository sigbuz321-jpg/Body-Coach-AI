# AI Body Coach — Design System

**Nama sistem:** **Piring & Plat** (Plate & Plate)
**Versi:** 1.0 · Mobile-first · Bahasa antarmuka: Indonesia

---

## 1. Arah desain

Dua benda mendefinisikan hidup pengguna ini: **piring enamel warteg** dan **plat besi barbel**. Keduanya kebetulan disebut "plate". Sistem ini dibangun dari kosakata itu.

- **Dari piring enamel:** permukaan putih dingin, rim tipis, tepi biru, permukaan bersih dan tanpa hiasan. Ini yang menjadi background dan card.
- **Dari plat Olympic:** pengkodean warna standar internasional — merah, biru, kuning, hijau di atas besi hitam. Ini yang menjadi palet fungsional. Warna tidak dipilih karena "estetik"; warna dipilih karena di gym warna sudah punya arti.

Konsekuensinya: **warna tidak pernah dekoratif di produk ini.** Merah berarti CUT. Biru berarti BULK. Hijau berarti protein. Kalau sebuah elemen tidak membawa makna, elemen itu abu-abu.

### Signature: The Plate Stack

Progres kalori harian tidak digambarkan sebagai ring atau progress bar, tetapi sebagai **barbel yang dimuat plat**. Setiap makanan yang dicatat menambahkan satu plat ke batang. Target harian adalah batang yang penuh.

Kenapa ini bukan gimmick: makan itu _diskrit_ (per makan, bukan mengalir), dan plat bertumpuk mengomunikasikan itu jauh lebih jujur daripada bar kontinu. Pengguna langsung melihat "gue baru makan 2 kali hari ini" tanpa membaca angka. Dan setiap orang yang pernah ke gym tahu cara membaca plat.

Plate Stack dipakai di **tepat dua tempat**: hero landing page dan kartu "Hari Ini" di dashboard. Di tempat lain, gunakan bar biasa. Satu elemen berani, sisanya tenang.

---

## 2. Color tokens

### 2.1 Neutral — Enamel & Iron

```
--enamel-0    #FFFFFF   permukaan card
--enamel-50   #F5F7F6   background aplikasi (light)
--enamel-100  #EAEEEC   background alternatif, section
--enamel-200  #DCE2DF   border halus
--enamel-300  #C2CBC6   border, divider
--enamel-400  #98A5A0   teks disabled
--iron-500    #6B7780   teks sekunder
--iron-600    #4A555E   teks body pada light
--iron-700    #2C3742   heading
--iron-800    #1C242E
--iron-900    #131A24   INK — teks utama, tombol primer
--iron-950    #0C1119   background dark mode
```

### 2.2 Plate — warna fungsional

```
--plate-blue   #1156C7    BULK · lemak (chart) · info
--plate-red    #E0332C    CUT · danger · over-target
--plate-yellow #F5B301    MAINTAIN · karbo (chart) · warning
--plate-green  #1E9E5A    protein (chart) · success · on-track
```

Setiap plate punya varian tint untuk background:

```
--plate-blue-tint    #E8F0FC     --plate-blue-strong    #0B3F94
--plate-red-tint     #FDEBEA     --plate-red-strong     #A8221D
--plate-yellow-tint  #FEF5E0     --plate-yellow-strong  #B58200
--plate-green-tint   #E6F5ED     --plate-green-strong   #157342
```

### 2.3 Pemetaan semantik

| Peran           | Token                                                |
| --------------- | ---------------------------------------------------- |
| Tombol primer   | `--iron-900`, teks `--enamel-0`                      |
| Tombol sekunder | transparan, border `--enamel-300`, teks `--iron-900` |
| Goal BULK       | `--plate-blue`                                       |
| Goal CUT        | `--plate-red`                                        |
| Goal MAINTAIN   | `--plate-yellow`                                     |
| Kalori (chart)  | `--iron-900`                                         |
| Protein         | `--plate-green`                                      |
| Karbohidrat     | `--plate-yellow`                                     |
| Lemak           | `--plate-blue`                                       |
| On track        | `--plate-green`                                      |
| Mendekati batas | `--plate-yellow`                                     |
| Melewati target | `--plate-red`                                        |

### 2.4 Dark mode

Dashboard punya mode gelap (banyak pengguna membuka dashboard malam hari, setelah makan terakhir).

```
bg          --iron-950 #0C1119
surface     #151D27
surface-2   #1E2833
border      #2A3542
text        #EDF1EF
text-muted  #9AA7B0
```

Warna plate dinaikkan luminансinya di dark mode: blue `#4C8CF0`, red `#FF6259`, yellow `#FFC93D`, green `#3DC77E`.

### 2.5 Aturan kontras

Minimum WCAG AA (4.5:1 untuk teks, 3:1 untuk elemen UI). `--plate-yellow` **tidak boleh** dipakai untuk teks di atas putih — hanya sebagai fill dengan teks `--iron-900` di atasnya.

---

## 3. Typography

| Peran         | Typeface                                               | Kenapa                                                                                                            |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Display**   | **Archivo** (variable, `wdth 100–120`, `wght 600–800`) | Grotesk dengan sumbu lebar. Diset lebar + huruf besar, terasa seperti label stensil pada alat gym. Dipakai hemat  |
| **Body / UI** | **Plus Jakarta Sans** (400/500/600)                    | Dirancang untuk Jakarta, humanis, sangat nyaman untuk teks Indonesia yang cenderung panjang                       |
| **Data**      | **JetBrains Mono** (500/700, tabular)                  | Semua angka gizi. Digit lebar sama sehingga angka tidak "loncat" saat berubah — penting untuk counter yang update |

### Skala (mobile / desktop)

```
display-xl   40/44  ·  64/64   Archivo 800, wdth 115, tracking -0.02em, UPPERCASE
display-l    32/36  ·  48/52   Archivo 700, wdth 110, tracking -0.02em
h1           26/32  ·  36/42   Archivo 700
h2           21/28  ·  28/34   Archivo 700
h3           18/24  ·  22/28   Plus Jakarta Sans 600
body-lg      17/26  ·  18/28   Plus Jakarta Sans 400
body         15/23  ·  16/26   Plus Jakarta Sans 400
body-sm      13/20  ·  14/22   Plus Jakarta Sans 400
label        12/16           Plus Jakarta Sans 600, UPPERCASE, tracking 0.08em
data-xl      44/44           JetBrains Mono 700, tabular
data-l       28/32           JetBrains Mono 700, tabular
data-m       18/24           JetBrains Mono 500, tabular
```

**Aturan angka:** setiap angka gizi memakai `data-*` dengan `font-variant-numeric: tabular-nums`. Satuan (`kkal`, `g`) selalu lebih kecil, `--iron-500`, dan tidak pernah huruf besar. Estimasi selalu diawali `±`.

---

## 4. Spacing, radius, elevation, motion

```
space   4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80        (basis 4px)
radius  sm 8 · md 12 · lg 16 · xl 24 · pill 999
        card = lg(16), sheet = xl(24) hanya sudut atas, chip = pill

elevation
  flat    tanpa shadow, border 1px --enamel-200        ← default untuk semua card
  raised  0 1px 2px rgba(19,26,36,.06), 0 4px 12px rgba(19,26,36,.06)
  sheet   0 -8px 32px rgba(19,26,36,.12)
  Tidak ada shadow di dark mode; pakai border --border.

motion
  fast 120ms · base 200ms · slow 320ms
  easing standar: cubic-bezier(.32,.72,0,1)
  Hormati prefers-reduced-motion: hilangkan translate, sisakan opacity.
```

**Detail signature — enamel rim:** card kelas "hero" (Plan Card, Today Card) memakai garis inset 1px `--enamel-200` yang offset 4px dari tepi, meniru rim piring enamel. Hanya di dua komponen itu. Jangan disebar.

---

## 5. Komponen

### 5.1 Button

| Varian      | Tampilan                                                  | Pakai untuk                              |
| ----------- | --------------------------------------------------------- | ---------------------------------------- |
| Primary     | fill `--iron-900`, teks putih, radius pill, h-52 (mobile) | Satu per layar. "Mulai gratis", "Lanjut" |
| Secondary   | border `--enamel-300`, teks `--iron-900`                  | Aksi sekunder                            |
| Goal        | fill warna goal                                           | Hanya di pemilihan goal                  |
| Ghost       | teks saja                                                 | "Lewati", "Ubah"                         |
| Destructive | teks `--plate-red`                                        | Hapus log                                |

State: hover → gelap 6% · active → scale .98 · focus → outline 2px `--plate-blue` offset 2px · loading → spinner, label tetap terbaca, lebar tidak berubah · disabled → `--enamel-200`, teks `--enamel-400`.

Tinggi minimum tap target 48px. Tombol utama di mobile selalu _sticky_ di bawah, dengan area aman 16px + safe-area-inset.

### 5.2 GoalCard (Bulk / Cut / Maintain)

Kartu pilihan besar, satu kolom di mobile. Isi: ikon plat, judul, satu baris deskripsi dalam bahasa pengguna ("Naikin berat & massa otot"), dan saat terpilih: border 2px warna goal + tint background + checkmark. Tidak terpilih: border `--enamel-200`, tanpa warna sama sekali. Kontras antara terpilih/tidak harus terbaca dalam sekejap.

### 5.3 PlateStack (signature)

Batang horizontal, plat bertumpuk dari kiri. Setiap plat = satu entri makanan; lebar plat proporsional terhadap kalorinya. Warna plat = netral iron; plat yang membuat total melewati target diberi warna `--plate-red`. Batang sisa digambar sebagai garis tipis. Di atasnya: angka `data-xl` (total kkal) dan label kecil target.

Animasi: plat baru masuk dari kanan dengan `slow` easing standar, sedikit overshoot, lalu "mendarat". Hanya saat ada log baru, bukan saat halaman dimuat.

Aksesibilitas: elemen ini `role="img"` dengan `aria-label` naratif ("1.830 dari 2.650 kkal, 4 kali makan tercatat"). Data yang sama juga tersedia sebagai teks di bawahnya.

### 5.4 MacroBar

Tiga bar horizontal (Protein, Karbo, Lemak), tinggi 10px, radius pill, track `--enamel-100`. Warna sesuai §2.3. Label kiri, nilai `data-m` kanan dengan format `98 / 140 g`. Melewati target → track diberi arsiran merah di bagian kelebihan, bukan bar penuh merah (kelebihan harus terbaca sebagai kelebihan, bukan sebagai kegagalan total).

### 5.5 FoodLogItem

Baris: thumbnail foto (jika ada, 48px, radius md) · nama makanan `body` 600 · porsi `body-sm` `--iron-500` · kanan: kkal `data-m`. Tap → sheet detail dengan makro dan tombol "Ubah porsi" / "Hapus".

Item dengan `confidence < 0.75` menampilkan chip kecil **"perlu dicek"** (`--plate-yellow-tint`). Ini kejujuran produk, bukan aib. Menyembunyikan ketidakpastian adalah cara tercepat kehilangan kepercayaan.

### 5.6 ChatBubble (untuk preview di landing & onboarding)

Dua varian: `incoming` (fill `--enamel-0`, border `--enamel-200`, sudut kiri-bawah 4px) dan `outgoing` (fill `--iron-900`, teks putih, sudut kanan-bawah 4px). Coach dapat menyisipkan **NutritionChip** di dalam bubble: baris mono kecil `±720 kkal · 35g P` dengan background tint.

Ini adalah _preview_, bukan tiruan WhatsApp. Jangan meniru warna atau aset merek WhatsApp. Beri label "Contoh percakapan".

### 5.7 StatTile, WeightChart, EmptyState

- **StatTile** — label kecil di atas, angka `data-l`, delta di bawah dengan panah dan warna hijau/merah. Delta selalu punya periode pembanding tertulis ("vs minggu lalu").
- **WeightChart** — titik harian `--enamel-300` kecil, garis tren EMA tebal `--iron-900`, pita target tipis. Berat badan berfluktuasi harian; menonjolkan tren, bukan titik, adalah keputusan produk sekaligus keputusan visual.
- **EmptyState** — satu kalimat yang menyebut aksi berikutnya, satu tombol. Bukan ilustrasi besar. Contoh: "Belum ada catatan hari ini. Kirim foto makan siang kamu ke coach." → tombol "Buka chat".

---

## 6. Voice & tone

Ada **dua suara** dan keduanya tidak boleh tertukar.

**Suara antarmuka (web)** — jelas, tenang, sopan, kalimat pendek, sentence case, tanpa jargon.

> "Target kamu dihitung dari tinggi, berat, umur, dan aktivitas."

**Suara coach (WhatsApp)** — teman gym. Santai, akrab, mengikuti kata ganti yang dipakai pengguna, maksimal satu emoji.

> "Protein lo masih kurang 42g. 150g ayam + 2 telur udah nutup kok."

Aturan yang berlaku untuk keduanya:

- **Selalu ada langkah berikutnya.** Angka tanpa saran adalah pekerjaan yang belum selesai.
- **Estimasi ditulis sebagai estimasi.** `±720 kkal`, tidak pernah `720 kkal`.
- **Tidak ada janji hasil.** "Perkiraan 6–8 bulan", bukan "turun 10 kg dalam 3 bulan".
- **Tidak ada rasa bersalah.** Melewati target bukan kegagalan moral. "Hari ini lewat 300 kkal. Besok normal lagi aja." Bukan "Kamu gagal."
- **Error menjelaskan dan memberi jalan keluar.** "Fotonya kurang jelas. Coba ambil dari atas, atau ketik aja makanannya."
- **Kata kerja aktif dan konsisten.** Tombol "Catat" menghasilkan konfirmasi "Tercatat." Bukan "Berhasil disimpan".

### Larangan copy

Jangan pernah menulis: "bakar lemak", "detox", "dijamin", "cheat day" sebagai pelanggaran, "makanan haram/terlarang" (dalam konteks diet), atau angka target untuk pengguna yang guardrail-nya memblokir.

---

## 7. Implementasi

```css
:root {
  --enamel-0: #fff;
  --enamel-50: #f5f7f6;
  --enamel-100: #eaeeec;
  --enamel-200: #dce2df;
  --enamel-300: #c2cbc6;
  --enamel-400: #98a5a0;
  --iron-500: #6b7780;
  --iron-600: #4a555e;
  --iron-700: #2c3742;
  --iron-800: #1c242e;
  --iron-900: #131a24;
  --iron-950: #0c1119;

  --plate-blue: #1156c7;
  --plate-blue-tint: #e8f0fc;
  --plate-red: #e0332c;
  --plate-red-tint: #fdebea;
  --plate-yellow: #f5b301;
  --plate-yellow-tint: #fef5e0;
  --plate-green: #1e9e5a;
  --plate-green-tint: #e6f5ed;

  --bg: var(--enamel-50);
  --surface: var(--enamel-0);
  --border: var(--enamel-200);
  --text: var(--iron-900);
  --text-muted: var(--iron-500);

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --ease: cubic-bezier(0.32, 0.72, 0, 1);

  --font-display: 'Archivo', system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-data: 'JetBrains Mono', ui-monospace, monospace;
}

[data-theme='dark'] {
  --bg: var(--iron-950);
  --surface: #151d27;
  --border: #2a3542;
  --text: #edf1ef;
  --text-muted: #9aa7b0;
  --plate-blue: #4c8cf0;
  --plate-red: #ff6259;
  --plate-yellow: #ffc93d;
  --plate-green: #3dc77e;
}

.num {
  font-family: var(--font-data);
  font-variant-numeric: tabular-nums;
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition-duration: 1ms !important;
  }
}
```

```js
// tailwind.config.js — theme.extend
colors: {
  enamel:{0:'#FFFFFF',50:'#F5F7F6',100:'#EAEEEC',200:'#DCE2DF',300:'#C2CBC6',400:'#98A5A0'},
  iron:{500:'#6B7780',600:'#4A555E',700:'#2C3742',800:'#1C242E',900:'#131A24',950:'#0C1119'},
  plate:{ blue:'#1156C7', red:'#E0332C', yellow:'#F5B301', green:'#1E9E5A' },
},
fontFamily:{ display:['Archivo'], sans:['Plus Jakarta Sans'], mono:['JetBrains Mono'] },
borderRadius:{ sm:'8px', md:'12px', lg:'16px', xl:'24px' },
```

Font via Google Fonts: `Archivo:wght@600;700;800` (variabel `wdth` bila tersedia), `Plus+Jakarta+Sans:wght@400;500;600;700`, `JetBrains+Mono:wght@500;700`.

---

## 8. Aturan aksesibilitas

- Kontras teks ≥ 4.5:1, elemen UI ≥ 3:1.
- Warna tidak pernah menjadi satu-satunya pembawa makna: goal selalu punya label teks, status makro selalu punya angka.
- Semua interaktif dapat dijangkau keyboard dengan focus ring 2px yang terlihat.
- Chart punya padanan tekstual.
- Ukuran font dasar 15–16px; jangan turun di bawah 13px untuk teks yang harus dibaca.
- Target sentuh ≥ 48×48px.
- Wizard onboarding: `aria-live="polite"` saat langkah berganti, progress diumumkan sebagai "Langkah 4 dari 10".
