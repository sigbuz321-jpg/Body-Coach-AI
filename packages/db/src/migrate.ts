import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withDirectClient } from './client';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Kunci advisory: dua proses migration tidak boleh berjalan bersamaan. */
const LOCK_KEY = 4_209_631_001;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function migrate(): Promise<void> {
  await withDirectClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      const { rows } = await client.query<{ version: string }>(
        'SELECT version FROM schema_migrations',
      );
      const applied = new Set(rows.map((r) => r.version));

      const pending = migrationFiles().filter((f) => !applied.has(f));
      if (pending.length === 0) {
        console.log(`Tidak ada migration baru. ${applied.size} sudah diterapkan.`);
        return;
      }

      for (const file of pending) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        process.stdout.write(`  ${file} ... `);
        // Satu migration = satu transaksi. Gagal di tengah berarti tidak ada
        // yang diterapkan, bukan skema separuh jadi.
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log('ok');
        } catch (error) {
          await client.query('ROLLBACK');
          console.log('GAGAL');
          throw error;
        }
      }
      console.log(`${pending.length} migration diterapkan.`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  });
}

await migrate();
