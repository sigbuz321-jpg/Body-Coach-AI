-- 0001_init.sql — skema awal.
-- Sumber: docs/02-technical-spec.md §3. Penyimpangan dari §3 ditandai [DEVIASI].
--
-- [DEVIASI] citext ditambahkan. §3 memakai tipe `citext` untuk users.email tapi
-- tidak mencantumkan ekstensinya di daftar CREATE EXTENSION. Tanpa ini migration gagal.
-- [DEVIASI] Semua index diberi nama eksplisit. §3 memakai `CREATE INDEX ON ...`
-- tanpa nama, sehingga Postgres membuat nama otomatis yang sulit dirujuk saat DROP.

CREATE EXTENSION IF NOT EXISTS citext;
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
  medical_flags    text[] NOT NULL DEFAULT '{}',   -- dideklarasi sendiri oleh user
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
CREATE INDEX target_versions_user_effective_idx
  ON target_versions (user_id, effective_from DESC);

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
CREATE INDEX food_items_name_id_trgm_idx ON food_items USING gin (name_id gin_trgm_ops);

-- [CATATAN] Index ivfflat dibangun saat tabel masih kosong, jadi kualitas
-- klasternya nol. Wajib REINDEX setelah embedding terisi di M6.
CREATE INDEX food_items_embedding_idx
  ON food_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE food_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_item_id uuid NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  alias        text NOT NULL,           -- 'geprek', 'nasgor', 'indomie goreng'
  alias_norm   text GENERATED ALWAYS AS (lower(trim(alias))) STORED,
  weight       numeric(3,2) NOT NULL DEFAULT 1.0
);
CREATE UNIQUE INDEX food_aliases_norm_item_uidx ON food_aliases (alias_norm, food_item_id);
CREATE INDEX food_aliases_norm_trgm_idx ON food_aliases USING gin (alias_norm gin_trgm_ops);

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
  source_message_id text UNIQUE,            -- idempotency dari WhatsApp (AD-2)
  photo_key         text,
  photo_sha256      text,
  scene_confidence  numeric(3,2),
  status            text NOT NULL DEFAULT 'confirmed'  -- pending|confirmed|discarded
);
CREATE INDEX food_logs_user_date_idx ON food_logs (user_id, local_date);

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
-- [DEVIASI] Tidak ada di §3. RLS pada food_log_items harus menempuh
-- food_log_id ke induknya; tanpa index ini setiap pemeriksaan policy
-- memicu sequential scan.
CREATE INDEX food_log_items_log_idx ON food_log_items (food_log_id);

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

-- Cache, bisa dibangun ulang kapan saja dari food_log_items.
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
CREATE INDEX messages_user_created_idx ON messages (user_id, created_at DESC);

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
CREATE INDEX ai_usage_user_date_idx ON ai_usage (user_id, local_date);
