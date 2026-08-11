-- 0003_idempotency.sql — kunci idempotensi untuk endpoint mutasi HTTP.
--
-- Konvensi CLAUDE.md: "Endpoint mutasi menerima header `Idempotency-Key`".
-- Sampai migration ini, header itu hanya divalidasi panjangnya lalu dibuang —
-- retry dari klien membuat user, profile, target_versions, dan link_tokens
-- ganda. Tabel ini yang membuat header tersebut benar-benar berarti.
--
-- Pola pakai (lihat repositories/idempotency.ts):
--   1. `claimIdempotencyKey` di awal transaksi — INSERT ... ON CONFLICT DO NOTHING.
--      Klaim gagal berarti request yang sama sudah/sedang diproses.
--   2. Kerjakan mutasinya.
--   3. `storeIdempotencyResponse` di transaksi yang sama.
-- Klaim dan respons commit bersama, jadi tidak ada kondisi "sudah diklaim tapi
-- responsnya tidak pernah tersimpan": kegagalan di tengah me-rollback keduanya.
--
-- Request duplikat yang datang bersamaan akan menunggu di row lock milik
-- request pertama, lalu membaca respons yang sudah commit. Bukan menulis ulang.

CREATE TABLE idempotency_keys (
  endpoint    text NOT NULL,
  key         text NOT NULL,
  response    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (endpoint, key)
);

-- Untuk pembersihan berkala (kunci lama tidak perlu disimpan selamanya).
CREATE INDEX idempotency_keys_created_idx ON idempotency_keys (created_at);

-- Sama seperti link_tokens: RLS aktif tanpa policy apa pun, jadi hanya
-- service role yang bisa menyentuhnya. Kunci idempotensi milik satu klien
-- tidak boleh terbaca klien lain — isinya adalah respons lengkap, termasuk
-- token pairing WhatsApp.
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
