import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ROUTES } from './routes';

/**
 * Menjaga agar setiap path di `ROUTES` benar-benar dilayani sebuah `page.tsx`.
 *
 * Ini bukan tes teoretis. Sebelum tes ini ada, `router.push('/onboarding/rencana')`
 * lolos typecheck, lint, dan build — lalu menjatuhkan pengguna ke 404 tepat
 * setelah rencananya selesai dihitung dan disimpan, karena `(onboarding)`
 * adalah route group yang tidak menyumbang segmen URL.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

/** Segmen route group — `(onboarding)` — tidak muncul di URL. */
function isRouteGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}

/** Semua URL yang dilayani `page.tsx` di dalam `app/`. */
function servedPaths(dir: string, segments: string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'api' || entry.name.startsWith('_')) continue;
      const next = isRouteGroup(entry.name) ? segments : [...segments, entry.name];
      found.push(...servedPaths(join(dir, entry.name), next));
    } else if (entry.name === 'page.tsx') {
      found.push(`/${segments.join('/')}`.replace(/\/$/, '') || '/');
    }
  }
  return found;
}

describe('ROUTES', () => {
  const served = new Set(servedPaths(APP_DIR));

  it('menemukan halaman di app/ (sanity check pemindaian)', () => {
    expect(served.size).toBeGreaterThan(0);
    expect(served.has('/')).toBe(true);
  });

  it.each(Object.entries(ROUTES))('%s -> %s dilayani oleh sebuah page.tsx', (_name, path) => {
    expect(served.has(path)).toBe(true);
  });

  it('tidak ada path yang mengandung segmen route group', () => {
    for (const path of Object.values(ROUTES)) {
      expect(path).not.toMatch(/\(|\)/);
    }
  });
});
