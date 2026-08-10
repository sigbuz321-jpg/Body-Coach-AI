import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';
import type { ClientConfig, PoolClient } from 'pg';

import { databaseUrl, directUrl } from './env';

const { Pool, Client, types } = pg;

/**
 * Kolom `date` dikembalikan apa adanya sebagai string 'YYYY-MM-DD'.
 *
 * Bawaannya, driver mengubahnya menjadi objek Date pada tengah malam waktu
 * lokal proses. Begitu nilai itu diserialisasi ke UTC — misalnya lewat
 * toISOString() atau JSON.stringify — tanggalnya mundur satu hari untuk siapa
 * pun di timezone positif, termasuk seluruh pengguna kita di WIB.
 *
 * `local_date` adalah sumbu utama produk ini: total harian, adherence, dan
 * rekap malam semuanya bergantung padanya. Tanggal tidak boleh pernah melewati
 * konversi timezone secara diam-diam.
 */
types.setTypeParser(types.builtins.DATE, (value) => value);

let warnedAboutTls = false;

/**
 * Supabase memakai CA sendiri, sehingga verifikasi bawaan Node menolaknya
 * dengan "self-signed certificate in certificate chain".
 *
 * Jawaban yang benar adalah menyematkan sertifikat CA Supabase, bukan
 * mematikan verifikasi. Unduh di Dashboard → Project Settings → Database →
 * SSL Configuration, simpan, lalu set DATABASE_CA_CERT_PATH.
 *
 * Tanpa itu koneksi tetap terenkripsi tetapi tidak terautentikasi — cukup
 * untuk pengembangan, TIDAK cukup untuk data kesehatan pengguna nyata.
 * Karena itu peringatannya berisik dan disengaja.
 */
function sslConfig(): ClientConfig['ssl'] {
  const caPath = process.env['DATABASE_CA_CERT_PATH'];
  if (caPath) {
    return { ca: readFileSync(resolve(caPath), 'utf8'), rejectUnauthorized: true };
  }
  if (!warnedAboutTls) {
    warnedAboutTls = true;
    console.warn(
      '[db] PERINGATAN: DATABASE_CA_CERT_PATH belum diset. Sertifikat server ' +
        'tidak diverifikasi. Wajib ditutup sebelum ada pengguna nyata.',
    );
  }
  return { rejectUnauthorized: false };
}

let pool: pg.Pool | undefined;

/** Pool ke connection pooler. Ini yang dipakai aplikasi saat runtime. */
export function getPool(): pg.Pool {
  pool ??= new Pool({
    connectionString: databaseUrl(),
    ssl: sslConfig(),
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/**
 * Koneksi sekali pakai ke session pooler. Untuk migration dan seed, yang
 * butuh DDL dan prepared statement — keduanya tidak didukung transaction pooler.
 */
export async function withDirectClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: directUrl(),
    ssl: sslConfig(),
    connectionTimeoutMillis: 30_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Jalankan `fn` di dalam satu transaksi pada pool aplikasi. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
