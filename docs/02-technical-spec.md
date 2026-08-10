# AI Body Coach — Technical Specification

Dokumen implementasi. Pasangan dari `01-system-design.md`.

---

## 1. Struktur repo

```
bodycoach/
├─ apps/
│  ├─ web/                    # Next.js: landing, onboarding, dashboard, API routes
│  │  ├─ app/(marketing)/     # landing, pricing, legal
│  │  ├─ app/(onboarding)/    # wizard 10 langkah
│  │  ├─ app/(app)/           # dashboard (auth required)
│  │  └─ app/api/
│  └─ worker/                 # job runtime (Inngest/Trigger functions)
├─ packages/
│  ├─ core/                   # domain — TIDAK BOLEH import framework/SDK
│  │  ├─ nutrition/           # BMR, TDEE, target, clamp, timeline, recalibration
│  │  ├─ food/                # resolver, portion prior, matching
│  │  ├─ coach/               # context assembly, guardrail, tool definitions
│  │  └─ types/
│  ├─ db/                     # schema, migrations, repository
│  ├─ ai/
│  │  ├─ providers/           # SATU-SATUNYA tempat SDK vendor di-import
│  │  └─ prompts/             # prompt versioned: coach.v3.ts, vision.v2.ts
│  ├─ whatsapp/               # client, templates, interactive builder
│  └─ ui/                     # design system (lihat 03-design-system.md)
├─ data/seeds/food/           # CSV food database Indonesia
└─ tooling/evals/             # eval harness akurasi makanan & guardrail
```

**Aturan dependency:** `core` tidak boleh import apa pun dari `apps/`, `ai/`, atau `db/`. Domain logic harus bisa dijalankan di test tanpa network. Ini yang membuat Nutrition Engine bisa dipercaya.

---

## 2. Environment variables

```bash
DATABASE_URL=
DIRECT_URL=
REDIS_URL=
REDIS_TOKEN=

WA_PHONE_NUMBER_ID=
WA_BUSINESS_ACCOUNT_ID=
WA_ACCESS_TOKEN=
WA_WEBHOOK_VERIFY_TOKEN=
WA_APP_SECRET=                # untuk X-Hub-Signature-256
WA_BUSINESS_NUMBER=           # format E.164 untuk deep link

AI_COACH_MODEL=
AI_VISION_MODEL=
AI_EMBEDDING_MODEL=
AI_PROVIDER_KEY=
AI_DAILY_COST_CAP_IDR=15000   # cap global harian, kill switch

PAYMENT_PROVIDER=xendit
PAYMENT_SECRET_KEY=
PAYMENT_WEBHOOK_TOKEN=

STORAGE_BUCKET=
APP_URL=
SENTRY_DSN=
POSTHOG_KEY=
```

---

## 3. Skema database

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============ IDENTITAS ============
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE,
  wa_id           text UNIQUE,                 -- E.164 tanpa '+'
  wa_linked_at    timestamptz,
  locale          text NOT NULL DEFAULT 'id-ID',
  timezone        text NOT NULL DEFAULT 'Asia/Jakarta',
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE link_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

-- ============ PROFIL & TARGET ============
CREATE TYPE goal_type      AS ENUM ('bulk','cut','maintain');
CREATE TYPE sex_type       AS ENUM ('male','female');
CREATE TYPE activity_level AS ENUM ('sedentary','light','moderate','high','very_high');

CREATE TABLE profiles (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name     text,
  sex              sex_type     NOT NULL,
  birth_year       int          NOT NULL,
  height_cm        numeric(5,1) NOT NULL CHECK (height_cm BETWEEN 120 AND 230),
  start_weight_kg  numeric(5,2) NOT NULL CHECK (start_weight_kg BETWEEN 30 AND 300),
  target_weight_kg numeric(5,2) NOT NULL,
  goal             goal_type    NOT NULL,
  activity         activity_level NOT NULL,
  gym_per_week     int NOT NULL DEFAULT 0 CHECK (gym_per_week BETWEEN 0 AND 14),
  food_prefs       text[] NOT NULL DEFAULT '{}',   -- halal, no_pork, vegetarian, no_seafood
  budget_per_meal  int,                            -- IDR, opsional
  medical_flags    text[] NOT NULL DEFAULT '{}',   -- diselfdeklarasi user
  conservative_mode boolean NOT NULL DEFAULT false,
  consent_health_data_at timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- APPEND-ONLY. Jangan pernah UPDATE baris lama. (AD-4)
CREATE TABLE target_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  goal           goal_type NOT NULL,
  bmr            int NOT NULL,
  tdee           int NOT NULL,
  kcal           int NOT NULL,
  protein_g      int NOT NULL,
  carbs_g        int NOT NULL,
  fat_g          int NOT NULL,
  weekly_rate_kg numeric(4,3) NOT NULL,          -- + bulk, - cut
  reason         text NOT NULL,                  -- onboarding | recalibration | user_edit | goal_change
  engine_version text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);
CREATE INDEX ON target_versions (user_id, effective_from DESC);

-- ============ FOOD DATABASE ============
CREATE TABLE food_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_id        text NOT NULL,
  name_en        text,
  category       text NOT NULL,   -- nasi, lauk, gorengan, mie, sayur, minuman, snack, buah
  cuisine        text NOT NULL DEFAULT 'indonesian',
  kcal_per_100g  numeric(6,2) NOT NULL,
  protein_per_100g numeric(6,2) NOT NULL,
  carbs_per_100g   numeric(6,2) NOT NULL,
  fat_per_100g     numeric(6,2) NOT NULL,
  source         text NOT NULL,   -- tkpi | usda | manual | vendor
  verified       boolean NOT NULL DEFAULT false,
  embedding      vector(1536),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON food_items USING gin (name_id gin_trgm_ops);
CREATE INDEX ON food_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE food_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  alias        text NOT NULL,           -- 'geprek', 'nasgor', 'indomie goreng'
  alias_norm   text GENERATED ALWAYS AS (lower(trim(alias))) STORED,
  weight       numeric(3,2) NOT NULL DEFAULT 1.0
);
CREATE UNIQUE INDEX ON food_aliases (alias_norm, food_item_id);
CREATE INDEX ON food_aliases USING gin (alias_norm gin_trgm_ops);

-- Prior porsi: inilah yang membuat estimasi foto masuk akal
CREATE TABLE food_portions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  label        text NOT NULL,    -- 'porsi warteg', 'centong', 'potong sedang', 'bungkus'
  grams        numeric(6,1) NOT NULL,
  is_default   boolean NOT NULL DEFAULT false
);

-- ============ LOGGING ============
CREATE TYPE log_source AS ENUM ('wa_text','wa_photo','web','recommendation');

CREATE TABLE food_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_at         timestamptz NOT NULL DEFAULT now(),
  local_date        date NOT NULL,          -- dihitung di timezone user
  meal_slot         text,                   -- sarapan|makan_siang|makan_malam|snack
  source            log_source NOT NULL,
  source_message_id text UNIQUE,            -- idempotency dari WhatsApp
  photo_key         text,
  photo_sha256      text,
  scene_confidence  numeric(3,2),
  status            text NOT NULL DEFAULT 'confirmed'  -- pending|confirmed|discarded
);
CREATE INDEX ON food_logs (user_id, local_date);

CREATE TABLE food_log_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_log_id    uuid NOT NULL REFERENCES food_logs(id) ON DELETE CASCADE,
  food_item_id   uuid REFERENCES food_items(id),
  raw_label      text NOT NULL,
  grams          numeric(7,1) NOT NULL,
  portion_basis  text NOT NULL,
  match_stage    text NOT NULL,    -- alias|trigram|vector|generic|user
  confidence     numeric(3,2) NOT NULL,
  kcal           numeric(7,1) NOT NULL,
  protein_g      numeric(6,1) NOT NULL,
  carbs_g        numeric(6,1) NOT NULL,
  fat_g          numeric(6,1) NOT NULL
);

CREATE TABLE corrections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_log_item_id uuid NOT NULL REFERENCES food_log_items(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  before           jsonb NOT NULL,
  after            jsonb NOT NULL,
  correction_type  text NOT NULL,   -- wrong_food|wrong_portion|not_food|missing_item
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE weight_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  weight_kg  numeric(5,2) NOT NULL CHECK (weight_kg BETWEEN 30 AND 300),
  source     text NOT NULL DEFAULT 'whatsapp',
  UNIQUE (user_id, local_date)
);

-- Cache, bisa dibangun ulang kapan saja
CREATE TABLE daily_summaries (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date     date NOT NULL,
  kcal           numeric(7,1) NOT NULL DEFAULT 0,
  protein_g      numeric(6,1) NOT NULL DEFAULT 0,
  carbs_g        numeric(6,1) NOT NULL DEFAULT 0,
  fat_g          numeric(6,1) NOT NULL DEFAULT 0,
  log_count      int NOT NULL DEFAULT 0,
  target_version_id uuid REFERENCES target_versions(id),
  adherence      numeric(4,3),
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_date)
);

-- ============ PERCAKAPAN ============
CREATE TABLE messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wa_message_id text UNIQUE,
  direction    text NOT NULL,   -- inbound|outbound
  kind         text NOT NULL,   -- text|image|interactive|template|system
  body         text,
  meta         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (user_id, created_at DESC);

-- ============ BILLING & USAGE ============
CREATE TABLE subscriptions (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan               text NOT NULL DEFAULT 'free',   -- free|pro_monthly|pro_annual
  status             text NOT NULL DEFAULT 'active', -- active|past_due|canceled
  current_period_end timestamptz,
  provider_ref       text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_usage (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  local_date  date NOT NULL,
  kind        text NOT NULL,    -- vision|chat|embedding|wa_template
  units       numeric(10,2) NOT NULL,
  cost_idr    numeric(10,2) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ai_usage (user_id, local_date);
```

**RLS:** aktifkan di `profiles`, `target_versions`, `food_logs`, `food_log_items`, `weight_entries`, `daily_summaries`, `messages`, `subscriptions`, `corrections`. Policy: `user_id = auth.uid()`. `food_items`/`food_aliases`/`food_portions` read-only publik.

---

## 4. Nutrition Engine

### 4.1 Konstanta

```ts
export const ACTIVITY_FACTOR = {
  sedentary: 1.20, light: 1.375, moderate: 1.55, high: 1.725, very_high: 1.90,
} as const;

// Penyesuaian frekuensi gym di atas activity factor dasar (dibatasi total 1.9)
export const GYM_BONUS = [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.12] as const;

export const RATE = {
  // laju perubahan berat mingguan sebagai % dari berat badan
  bulk:    { min: 0.0020, default: 0.0035, max: 0.0050 },
  cut:     { min: 0.0050, default: 0.0075, max: 0.0100 },
  maintain:{ min: 0,      default: 0,      max: 0      },
} as const;

export const KCAL_PER_KG_BW = 7700; // ~1 kg jaringan campuran
export const KCAL_FLOOR = { male: 1500, female: 1200 } as const;
export const PROTEIN_G_PER_KG = { bulk: 1.8, cut: 2.2, maintain: 1.8 } as const;
export const PROTEIN_G_PER_KG_MAX = 2.6;
export const FAT_PCT_OF_KCAL = 0.25;
export const FAT_G_PER_KG_MIN = 0.6;
export const ENGINE_VERSION = 'nutrition@1.0.0';
```

### 4.2 Algoritma

```ts
export function computeTargets(p: Profile): TargetSet {
  // 1. BMR — Mifflin-St Jeor
  const age = currentYear() - p.birthYear;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * age;
  const bmr = Math.round(p.sex === 'male' ? base + 5 : base - 161);

  // 2. TDEE
  const factor = Math.min(ACTIVITY_FACTOR[p.activity] + GYM_BONUS[Math.min(p.gymPerWeek, 7)], 1.9);
  const tdee = Math.round(bmr * factor);

  // 3. Laju target — clamp jarak ke target berat yang terlalu agresif
  const rate = RATE[p.goal].default; // fraksi BW/minggu
  const weeklyKg = p.weightKg * rate * (p.goal === 'cut' ? -1 : 1);

  // 4. Adjustment kalori dari laju (bukan dari % TDEE — lebih akurat lintas ukuran tubuh)
  const dailyAdj = (weeklyKg * KCAL_PER_KG_BW) / 7;
  let kcal = Math.round(tdee + dailyAdj);

  // 5. Safety clamp
  kcal = Math.max(kcal, KCAL_FLOOR[p.sex], Math.round(bmr * 1.05));
  if (p.conservativeMode) kcal = Math.max(kcal, Math.round(tdee * 0.85));

  // 6. Makro — protein dulu, lemak minimum, sisanya karbo
  const proteinRef =
    p.goal === 'cut'
      ? Math.min(p.weightKg, p.targetWeightKg) // cut: pakai berat yang lebih rendah
      : p.weightKg;
  const proteinG = Math.round(
    Math.min(PROTEIN_G_PER_KG[p.goal], PROTEIN_G_PER_KG_MAX) * proteinRef,
  );

  const fatFromPct = (kcal * FAT_PCT_OF_KCAL) / 9;
  const fatG = Math.round(Math.max(fatFromPct, FAT_G_PER_KG_MIN * p.weightKg));

  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  return { bmr, tdee, kcal, proteinG, carbsG, fatG, weeklyKg, engineVersion: ENGINE_VERSION };
}

export function estimateTimeline(p: Profile, weeklyKg: number): TimelineRange {
  const delta = Math.abs(p.targetWeightKg - p.weightKg);
  const weeks = delta / Math.abs(weeklyKg);
  // Ditampilkan sebagai rentang: kepatuhan tidak pernah 100%
  return { minWeeks: Math.round(weeks * 0.85), maxWeeks: Math.round(weeks * 1.35) };
}
```

### 4.3 Guardrail sebelum engine dipanggil

```ts
export function validateGoal(p: Profile): GuardrailResult {
  const bmi = p.weightKg / (p.heightCm / 100) ** 2;
  const targetBmi = p.targetWeightKg / (p.heightCm / 100) ** 2;

  if (bmi < 18.5 && p.goal === 'cut') return block('cut_underweight'); // tawarkan MAINTAIN/BULK + saran konsultasi
  if (targetBmi < 18.5) return block('target_underweight');
  if (p.goal === 'cut' && p.targetWeightKg >= p.weightKg) return block('goal_mismatch');
  if (p.goal === 'bulk' && p.targetWeightKg <= p.weightKg) return block('goal_mismatch');
  if (Math.abs(p.targetWeightKg - p.weightKg) / p.weightKg > 0.4) return warn('extreme_delta'); // lanjut, tapi pecah jadi milestone bertahap
  if (p.medicalFlags.length > 0) return warn('medical_flag'); // conservativeMode = true + saran konsultasi

  return ok();
}
```

Setiap `block` **tidak** menghasilkan angka kalori apa pun. UI menampilkan penjelasan dan jalur alternatif, bukan error mentah.

### 4.4 Test wajib

```
✓ BMR pria 25th 70kg 175cm = 1673 kcal
✓ BMR wanita 25th 55kg 160cm = 1257 kcal
✓ CUT tidak pernah menghasilkan kcal < floor jenis kelamin
✓ CUT tidak pernah menghasilkan kcal < BMR × 1.05
✓ protein_g × 4 + fat_g × 9 <= kcal (carbs tidak pernah negatif)
✓ BMI 17.2 + goal cut → block, tanpa angka
✓ target BMI 18.0 → block
✓ property test: 10.000 profil acak → semua invariant terpenuhi
✓ snapshot: 20 profil referensi menghasilkan angka identik lintas rilis
```

---

## 5. Food Resolver

```ts
async function resolveFood(raw: string, ctx: UserCtx): Promise<Resolution> {
  const q = normalize(raw); // lowercase, hapus diakritik, hapus stopword: "seporsi","tadi","gue makan"

  // Tahap 1 — alias eksak
  const alias = await db.findAlias(q);
  if (alias) return { ...alias, stage: 'alias', confidence: 1.0 };

  // Tahap 2 — trigram
  const trg = await db.trigramSearch(q, { threshold: 0.45, limit: 5 });
  if (trg[0]?.similarity > 0.6)
    return { ...trg[0], stage: 'trigram', confidence: clamp(trg[0].similarity, 0.7, 0.9) };

  // Tahap 3 — vector kNN
  const emb = await embed(q);
  const vec = await db.vectorSearch(emb, { limit: 5 });
  if (vec[0]?.score > 0.78)
    return { ...vec[0], stage: 'vector', confidence: clamp(vec[0].score, 0.5, 0.8) };

  // Tahap 4 — generic + klarifikasi
  return {
    stage: 'generic',
    confidence: 0.3,
    needsClarification: true,
    candidates: [...trg.slice(0, 3), ...vec.slice(0, 3)],
  };
}
```

**Estimasi porsi** (urut prioritas):

1. User menyebut eksplisit → pakai itu (`portion_basis: user_stated`).
2. Vision memberi `container_ratio` atau `reference_object` → pakai, dibatasi ±60% dari default porsi.
3. Fallback `food_portions.is_default`.

Normalisasi teks Indonesia yang wajib ada: `nasgor→nasi goreng`, `geprek→ayam geprek`, `indomie→mie instan goreng`, `es teh manis→teh manis dingin`, angka bahasa (`1/2`, `setengah`, `seporsi`, `sebungkus`, `2 potong`).

---

## 6. Kontrak Coach LLM

### 6.1 System prompt (versioned: `coach.v1`)

```
Kamu adalah coach nutrisi di WhatsApp untuk pengguna Indonesia yang sedang BULK, CUT, atau MAINTAIN.

GAYA
- Bahasa Indonesia sehari-hari, santai seperti teman gym. "lo/gue" jika user memakainya, "kamu/aku" jika user formal. Ikuti user.
- Pendek. Maksimal 3 kalimat kecuali user minta penjelasan.
- Emoji seperlunya, maksimal satu per pesan.
- Jangan pernah terdengar seperti dokter atau jurnal ilmiah.

ATURAN ANGKA — TIDAK BISA DILANGGAR
- Kamu TIDAK PERNAH mengarang angka kalori, protein, karbo, atau lemak.
- Semua angka harus berasal dari hasil tool. Kalau kamu tidak punya angka dari tool, panggil tool-nya.
- Tulis angka hasil estimasi dengan tanda ±. Contoh: "±720 kkal".

SELALU BERI LANGKAH BERIKUTNYA
Jangan berhenti di "protein kamu kurang 40g". Selalu lanjutkan dengan satu saran konkret dan
realistis untuk makanan yang tersedia di Indonesia, sesuai preferensi dan budget user.

BATASAN
- Jangan memberi saran defisit ekstrem, puasa berkepanjangan, atau "detox".
- Jangan menjanjikan hasil dalam waktu tertentu.
- Kalau user menyebut kondisi medis, kehamilan, atau obat: sarankan konsultasi tenaga kesehatan,
  lalu tetap bantu dalam batas aman.
- Kalau user menunjukkan tanda gangguan makan (memuntahkan makanan, tidak makan berhari-hari,
  rasa bersalah ekstrem soal makan, target berat yang membahayakan): berhenti memberi angka,
  respons dengan hangat, dan panggil tool escalate_concern.
- Kamu bukan pengganti tenaga kesehatan. Ini panduan wellness, bukan diagnosis.

KONTEKS USER
{{user_context_block}}
```

`user_context_block` dirakit deterministik, bukan oleh LLM:

```
Nama: Daffa · Goal: BULK · 63.4 → 70 kg
Target hari ini: 2650 kkal · P140 · K320 · L75
Sudah masuk: 1830 kkal · P98 · K210 · L58   (sisa: 820 kkal · P42)
Waktu: 19:14 WIB · Sisa slot: makan malam
Preferensi: halal, tidak suka seafood · Budget/makan: ±30.000
Berat 7 hari terakhir (EMA): 63.1 → 63.4 (+0.3)
Adherence 7 hari: 5/7 hari tercatat
```

### 6.2 Tool definitions

```json
[
  {
    "name": "log_food",
    "description": "Catat makanan yang dikonsumsi user. Panggil ini setiap kali user menyebutkan makanan yang sudah dimakan.",
    "input_schema": {
      "type": "object",
      "properties": {
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "raw_label": { "type": "string" },
              "quantity_text": {
                "type": "string",
                "description": "kutipan porsi dari user, mis. 'setengah porsi'"
              },
              "meal_slot": {
                "type": "string",
                "enum": ["sarapan", "makan_siang", "makan_malam", "snack"]
              }
            },
            "required": ["raw_label"]
          }
        }
      },
      "required": ["items"]
    }
  },
  {
    "name": "get_daily_status",
    "description": "Ambil total konsumsi hari ini vs target. Panggil sebelum menjawab pertanyaan tentang sisa kalori/protein.",
    "input_schema": { "type": "object", "properties": { "date": { "type": "string" } } }
  },
  {
    "name": "recommend_meal",
    "description": "Minta rekomendasi makanan berdasarkan sisa kalori dan makro, preferensi, dan budget user.",
    "input_schema": {
      "type": "object",
      "properties": {
        "meal_slot": { "type": "string" },
        "budget_idr": { "type": "integer" },
        "must_include": { "type": "array", "items": { "type": "string" } },
        "exclude": { "type": "array", "items": { "type": "string" } }
      }
    }
  },
  {
    "name": "lookup_food",
    "description": "Cari info gizi makanan tanpa mencatatnya. Untuk pertanyaan seperti 'berapa kalori nasi padang?'.",
    "input_schema": {
      "type": "object",
      "properties": { "query": { "type": "string" } },
      "required": ["query"]
    }
  },
  {
    "name": "update_weight",
    "input_schema": {
      "type": "object",
      "properties": { "weight_kg": { "type": "number" } },
      "required": ["weight_kg"]
    }
  },
  {
    "name": "get_progress",
    "description": "Tren berat dan adherence beberapa minggu terakhir.",
    "input_schema": { "type": "object", "properties": { "weeks": { "type": "integer" } } }
  },
  {
    "name": "escalate_concern",
    "description": "Panggil saat terdeteksi tanda gangguan makan, krisis, atau kondisi medis serius. Menghentikan coaching angka.",
    "input_schema": {
      "type": "object",
      "properties": {
        "reason": { "type": "string" },
        "severity": { "type": "string", "enum": ["medical", "eating_disorder", "crisis"] }
      },
      "required": ["reason", "severity"]
    }
  }
]
```

`recommend_meal` **bukan** dikerjakan LLM sendirian: engine memfilter kandidat dari food DB berdasarkan sisa makro (knapsack sederhana pada kombinasi 2–3 item), lalu LLM hanya menyusun kalimatnya.

### 6.3 Vision prompt (`vision.v1`)

```
Identifikasi makanan dan minuman pada foto. Konteks: makanan Indonesia (warteg, Padang,
street food, rumahan, fast food).

Aturan:
- JANGAN menghitung kalori atau makro. Hanya identifikasi dan estimasi berat.
- Estimasi berat dalam gram per komponen, terpisah (nasi, lauk, sayur, sambal, kuah dihitung sendiri).
- Gunakan objek referensi yang terlihat (piring, sendok, tangan, gelas, kemasan) untuk skala.
- Sebutkan dasar estimasi porsi di portion_basis.
- Kalau bukan makanan, set is_food=false.
- Kalau ragu antara beberapa makanan, pilih yang paling umum di Indonesia dan turunkan confidence.

Balas HANYA JSON sesuai schema, tanpa teks lain.
```

### 6.4 Post-processing wajib

```ts
const reply = await coach.generate(ctx);
const claimed = extractNumbers(reply.text); // regex kcal/g
const truth = engineNumbers(ctx.toolResults);
if (!numbersMatch(claimed, truth, { tolerance: 0.02 })) {
  metrics.inc('coach.number_mismatch');
  return renderDeterministicTemplate(truth); // fallback, bukan retry tak terbatas
}
```

---

## 7. Webhook handler

```ts
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'), env.WA_APP_SECRET))
    return new Response('invalid signature', { status: 401 });

  const payload = JSON.parse(raw);

  for (const msg of extractMessages(payload)) {
    // Dedup: Meta me-retry dan kadang mengirim duplikat
    const fresh = await redis.set(`msg:${msg.id}`, '1', { nx: true, ex: 172800 });
    if (!fresh) continue;

    await queue.send('message.received', {
      waId: msg.from,
      messageId: msg.id,
      type: msg.type,
      body: msg.text?.body,
      mediaId: msg.image?.id,
      ts: msg.timestamp,
    });
  }

  return new Response('ok', { status: 200 }); // SELALU 200, secepat mungkin
}
```

Worker `message.received` memakai **concurrency key = userId** agar pesan beruntun dari satu user diproses berurutan. Tanpa ini, user yang mengirim tiga foto sekaligus akan mendapat tiga balasan yang saling menimpa total harian.

---

## 8. Jobs terjadwal

| Job                  | Jadwal (WIB)        | Isi                                                                                             |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `summary.daily`      | 21:00               | Rekap kalori/protein, sisa target, saran penutup. Free-form kalau <24 jam, template kalau tidak |
| `report.weekly`      | Minggu 09:00        | Rata-rata harian, adherence, tren berat, satu fokus minggu depan                                |
| `weighin.reminder`   | Senin & Kamis 07:00 | Hanya kalau belum ada entri 4 hari                                                              |
| `target.recalibrate` | Senin 06:00         | Algoritma di `01-system-design.md` §4.5                                                         |
| `summary.rebuild`    | 02:00               | Rebuild `daily_summaries` H-1 (konsistensi)                                                     |
| `billing.dunning`    | 08:00               | Retry pembayaran gagal, notifikasi                                                              |
| `cost.guard`         | tiap jam            | Cek `ai_usage` vs cap, aktifkan mode degradasi                                                  |

---

## 9. Entitlement Free vs Pro

```ts
export const LIMITS = {
  free: {
    foodLogsPerDay: 3,
    photoAnalysisPerDay: 1,
    coachMessagesPerDay: 10,
    proactiveCoaching: false,
    weeklyReport: false,
    historyDays: 7,
  },
  pro: {
    foodLogsPerDay: Infinity,
    photoAnalysisPerDay: 30,
    coachMessagesPerDay: 100,
    proactiveCoaching: true,
    weeklyReport: true,
    historyDays: Infinity,
  },
} as const;
```

Ketika limit Free tercapai, pesan penolakan **tetap memberi nilai** sebelum menawarkan upgrade:

> "Log gratis hari ini udah 3/3. Total lo sejauh ini 1.480 kkal, protein 78g. Mau lanjut catat tanpa batas? Upgrade di sini → link"

Bukan dinding kosong. Ini yang membedakan paywall yang converting dari paywall yang bikin churn.

---

## 10. Strategi testing

| Layer            | Pendekatan                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Nutrition Engine | Unit + property test (§4.4). Target coverage 100%                                                                                  |
| Food Resolver    | **Golden set 200 kalimat Indonesia** → expected food_item_id. Target akurasi top-1 ≥85%                                            |
| Vision           | **50 foto makanan Indonesia berlabel manual**. Metrik: item recall, error porsi median (target <25%)                               |
| Guardrail        | Suite 40 prompt adversarial (gangguan makan, permintaan defisit ekstrem, klaim medis, jailbreak). **Harus 100% lolos untuk rilis** |
| Coach output     | Golden test kecocokan angka reply vs engine                                                                                        |
| Webhook          | Replay 3× payload identik → tepat 1 log tercipta                                                                                   |
| E2E              | Playwright: landing → onboarding → plan → simulasi WA → dashboard                                                                  |

`tooling/evals/` dijalankan di CI setiap PR yang menyentuh `packages/ai/` atau `packages/core/`.

---

## 11. Rollout

1. **Internal** — 1 nomor, founder + 3 teman, 1 minggu.
2. **Concierge** — 10–20 user, manusia mengawasi setiap balasan sebelum dikirim (mode approval). Ini menghasilkan data koreksi terbaik dan menemukan kasus yang tidak terpikirkan.
3. **Closed beta** — 50–100 user, otomatis penuh, feature flag per user.
4. **Open beta** — daftar tunggu dibuka, monitor quality rating WhatsApp harian.

Kill switch yang harus ada sebelum user pertama: matikan vision, matikan proactive, matikan tulis (mode read-only), dan pesan pemeliharaan otomatis.
