import type { Pool, PoolClient } from 'pg';

type Q = Pool | PoolClient;

/**
 * Kunci idempotensi untuk endpoint mutasi HTTP (migration 0003).
 *
 * Ketiga fungsi ini dipakai bersama dalam SATU transaksi:
 *
 * ```ts
 * await withTransaction(async (client) => {
 *   if (!(await claimIdempotencyKey(client, endpoint, key))) {
 *     return { replayed: await findIdempotencyResponse(client, endpoint, key) };
 *   }
 *   const body = await doTheWork(client);
 *   await storeIdempotencyResponse(client, endpoint, key, body);
 *   return { replayed: null, body };
 * });
 * ```
 *
 * Klaim di awal, bukan di akhir: dua request identik yang datang bersamaan
 * membuat yang kedua menunggu di row lock, bukan mengerjakan mutasi yang sama
 * dua kali.
 */

/**
 * Mengklaim kunci. `true` bila klaim berhasil (request ini yang mengerjakan),
 * `false` bila kunci sudah dipegang request lain — pemanggil harus membaca
 * respons tersimpan lewat `findIdempotencyResponse`, bukan mengulang mutasi.
 */
export async function claimIdempotencyKey(db: Q, endpoint: string, key: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO idempotency_keys (endpoint, key)
     VALUES ($1, $2)
     ON CONFLICT (endpoint, key) DO NOTHING`,
    [endpoint, key],
  );
  return (rowCount ?? 0) > 0;
}

/** Menyimpan respons final untuk kunci yang sudah diklaim. */
export async function storeIdempotencyResponse(
  db: Q,
  endpoint: string,
  key: string,
  response: unknown,
): Promise<void> {
  await db.query(
    `UPDATE idempotency_keys SET response = $3::jsonb
      WHERE endpoint = $1 AND key = $2`,
    [endpoint, key, JSON.stringify(response)],
  );
}

/**
 * Respons yang tersimpan untuk kunci ini, atau `null` bila kunci belum pernah
 * dipakai. Nilai `null` juga dikembalikan bila baris ada tapi responsnya belum
 * terisi — kondisi yang seharusnya mustahil karena klaim dan respons commit
 * bersama, tapi pemanggil tetap wajib menanganinya.
 */
export async function findIdempotencyResponse<T>(
  db: Q,
  endpoint: string,
  key: string,
): Promise<T | null> {
  const { rows } = await db.query<{ response: T | null }>(
    'SELECT response FROM idempotency_keys WHERE endpoint = $1 AND key = $2',
    [endpoint, key],
  );
  return rows[0]?.response ?? null;
}
