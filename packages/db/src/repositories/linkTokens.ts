import type { Pool, PoolClient } from 'pg';

import type { LinkTokenRow } from '../types';

type Q = Pool | PoolClient;

/**
 * Token pairing WhatsApp. Pengguna mengirim `MULAI-<token>` ke nomor bisnis;
 * webhook M5 menukarnya dengan `user_id` lalu menandainya terpakai.
 *
 * Token dibuat di sisi server dan HARUS dibaca kembali dari nilai kembalian
 * fungsi ini — token yang ditampilkan ke pengguna wajib token yang sama dengan
 * yang tersimpan di baris ini.
 */
export async function createLinkToken(
  db: Q,
  input: { token: string; userId: string; ttlHours?: number },
): Promise<LinkTokenRow> {
  const { rows } = await db.query<LinkTokenRow>(
    `INSERT INTO link_tokens (token, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3))
     RETURNING *`,
    [input.token, input.userId, input.ttlHours ?? 24],
  );
  const row = rows[0];
  if (!row) throw new Error('createLinkToken tidak mengembalikan baris');
  return row;
}

function isUniqueViolation(err: unknown): boolean {
  // Kode SQLSTATE, bukan teks pesan: pesan Postgres bergantung pada locale
  // server dan berubah antar versi.
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

/**
 * Membuat link token dengan penanganan tabrakan.
 *
 * `generate` dipanggil ulang setiap percobaan — pembuatan string acaknya milik
 * pemanggil (butuh `node:crypto`, yang tidak boleh masuk lapisan ini).
 *
 * Tabrakan ditangani dengan SAVEPOINT: di Postgres satu statement yang gagal
 * membatalkan seluruh transaksi, jadi INSERT kedua tanpa savepoint hanya
 * menghasilkan "current transaction is aborted". Karena itu fungsi ini
 * menuntut `PoolClient` di dalam transaksi, bukan `Pool`.
 */
export async function createUniqueLinkToken(
  client: PoolClient,
  input: { userId: string; generate: () => string; ttlHours?: number; maxAttempts?: number },
): Promise<LinkTokenRow> {
  const maxAttempts = input.maxAttempts ?? 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await client.query('SAVEPOINT link_token_attempt');
    try {
      const row = await createLinkToken(client, {
        token: input.generate(),
        userId: input.userId,
        ...(input.ttlHours === undefined ? {} : { ttlHours: input.ttlHours }),
      });
      await client.query('RELEASE SAVEPOINT link_token_attempt');
      return row;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT link_token_attempt');
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error(`gagal membuat link token unik setelah ${maxAttempts} percobaan`);
}
