/**
 * @bodycoach/db — schema, migration, repository (Postgres + pgvector + pg_trgm).
 *
 * Isi menyusul di M1: migrations/0001_init.sql (persis docs/02-technical-spec.md §3),
 * migrations/0002_rls.sql, src/client.ts, src/repositories/, src/seed.ts.
 */

export const DB_PACKAGE = '@bodycoach/db' as const;
