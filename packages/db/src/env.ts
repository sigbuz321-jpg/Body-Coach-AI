import { z } from 'zod';

/**
 * Validasi env di boundary (konvensi CLAUDE.md). Dibaca malas — mengimpor
 * package ini tidak boleh langsung meledak hanya karena satu variabel yang
 * tidak relevan untuk perintah yang sedang dijalankan belum diisi.
 */

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    message: 'harus berupa connection string Postgres, bukan URL REST Supabase',
  });

/** Connection pooler (transaction mode, :6543). Dipakai aplikasi. */
export function databaseUrl(): string {
  return postgresUrl.parse(process.env['DATABASE_URL'] ?? '');
}

/**
 * Session pooler (:5432). Dipakai migration dan seed — keduanya butuh DDL
 * dan prepared statement, yang tidak didukung transaction pooler.
 */
export function directUrl(): string {
  return postgresUrl.parse(process.env['DIRECT_URL'] ?? '');
}

/**
 * Upstash Redis REST. `REDIS_URL` harus berupa endpoint HTTPS
 * (`https://<nama>.upstash.io`), bukan `redis://` — klien di `redis.ts`
 * memakai REST supaya bisa dipakai dari fungsi serverless yang tidak bisa
 * memelihara koneksi TCP antar invokasi.
 */
const upstashUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('https://'), {
    message: 'harus endpoint REST Upstash (https://...), bukan redis://',
  });

export function redisEnv(): { url: string; token: string } {
  return {
    url: upstashUrl.parse(process.env['REDIS_URL'] ?? ''),
    token: z
      .string()
      .min(1)
      .parse(process.env['REDIS_TOKEN'] ?? ''),
  };
}
