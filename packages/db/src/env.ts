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
