/**
 * @bodycoach/db — schema, migration, repository (Postgres + pgvector + pg_trgm).
 *
 * Skema ada di migrations/, sumbernya docs/02-technical-spec.md §3.
 * RLS aktif di semua tabel user-scoped; worker memakai service role yang melewatinya.
 */

export const DB_PACKAGE = '@bodycoach/db' as const;

export { closePool, getPool, withDirectClient, withTransaction } from './client';
export * from './repositories';
export type * from './types';
