import type { Pool, PoolClient } from 'pg';

import type { UserRow } from '../types';

type Q = Pool | PoolClient;

export async function findUserByWaId(db: Q, waId: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT * FROM users WHERE wa_id = $1 AND deleted_at IS NULL',
    [waId],
  );
  return rows[0] ?? null;
}

export async function findUserById(db: Q, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser(
  db: Q,
  input: { id?: string; email?: string | null; timezone?: string },
): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (id, email, timezone)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, COALESCE($3, 'Asia/Jakarta'))
     RETURNING *`,
    [input.id ?? null, input.email ?? null, input.timezone ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error('createUser tidak mengembalikan baris');
  return row;
}

/**
 * Menautkan nomor WhatsApp ke user. Dipakai saat pairing `MULAI-<token>` (M5).
 * `wa_id` unik, jadi menautkan nomor yang sudah dipakai user lain akan gagal
 * di constraint — itu memang perilaku yang diinginkan.
 */
export async function linkWhatsApp(db: Q, userId: string, waId: string): Promise<UserRow> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET wa_id = $2, wa_linked_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [userId, waId],
  );
  const row = rows[0];
  if (!row) throw new Error(`user ${userId} tidak ditemukan`);
  return row;
}
