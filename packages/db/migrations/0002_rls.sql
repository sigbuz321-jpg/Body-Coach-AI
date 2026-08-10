-- 0002_rls.sql — Row Level Security.
--
-- Policy ditulis bersamaan dengan ENABLE ROW LEVEL SECURITY, tidak terpisah.
-- RLS tanpa policy membuat semua query mengembalikan kosong; itulah yang biasanya
-- membuat orang menyerah lalu mematikan RLS sama sekali (lihat risiko M1 di PLAN.md).
--
-- Model: `user_id = auth.uid()` sebagai tenant key (docs/01-system-design.md §5, §10).
-- `postgres` (pemilik tabel) dan `service_role` melewati RLS — itu yang dipakai worker.
--
-- Hak akses disetel ulang dari nol supaya RLS menjadi satu-satunya gerbang,
-- bukan lapisan kedua di atas GRANT yang tidak diketahui isinya.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ============ FOOD DATABASE — baca publik ============
-- Bukan data user. Semua orang boleh membaca, tidak ada yang boleh menulis.
ALTER TABLE food_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_aliases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_portions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food_items, food_aliases, food_portions TO anon, authenticated;

CREATE POLICY food_items_read    ON food_items    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY food_aliases_read  ON food_aliases  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY food_portions_read ON food_portions FOR SELECT TO anon, authenticated USING (true);

-- ============ IDENTITAS ============
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON users TO authenticated;

CREATE POLICY users_self_read ON users
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY users_self_update ON users
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- [DEVIASI] §3 tidak menyebut link_tokens dalam daftar RLS. Tabel ini memegang
-- token pairing WhatsApp: siapa pun yang bisa membacanya dapat menautkan akun
-- orang lain ke nomornya sendiri. RLS diaktifkan tanpa policy apa pun, sehingga
-- hanya service role (worker) yang bisa menyentuhnya.

-- ============ PROFIL & TARGET ============
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_versions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
-- Sengaja tanpa UPDATE dan DELETE: target bersifat append-only (AD-4).
GRANT SELECT, INSERT ON target_versions TO authenticated;

CREATE POLICY profiles_own ON profiles
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- AD-4 ditegakkan di database, bukan hanya di kode aplikasi. Tidak ada policy
-- UPDATE atau DELETE, jadi baris target lama tidak bisa ditimpa bahkan oleh
-- token yang sah. Rekalibrasi harus membuat baris baru.
CREATE POLICY target_versions_read ON target_versions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY target_versions_append ON target_versions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ LOGGING ============
ALTER TABLE food_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_log_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON food_logs, food_log_items, weight_entries TO authenticated;
GRANT SELECT, INSERT ON corrections TO authenticated;

CREATE POLICY food_logs_own ON food_logs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- food_log_items tidak punya user_id; kepemilikan ditempuh lewat induknya.
CREATE POLICY food_log_items_own ON food_log_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM food_logs fl WHERE fl.id = food_log_id AND fl.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM food_logs fl WHERE fl.id = food_log_id AND fl.user_id = auth.uid()));

CREATE POLICY corrections_read ON corrections
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY corrections_append ON corrections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY weight_entries_own ON weight_entries
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ TURUNAN & PERCAKAPAN — baca saja bagi user ============
-- Ditulis oleh worker lewat service role. User hanya membaca miliknya sendiri.
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON daily_summaries, messages, subscriptions TO authenticated;

CREATE POLICY daily_summaries_read ON daily_summaries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY messages_read ON messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY subscriptions_read ON subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ BIAYA — internal ============
-- [DEVIASI] §3 tidak menyebut ai_usage. Isinya biaya per pengguna: data internal,
-- bukan milik user. RLS aktif tanpa policy — tidak terjangkau anon maupun authenticated.
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
