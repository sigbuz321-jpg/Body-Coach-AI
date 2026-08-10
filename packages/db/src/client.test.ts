import pg from 'pg';
import { describe, expect, it } from 'vitest';

import './client';

describe('parser tipe date', () => {
  it('mengembalikan kolom date sebagai string, bukan objek Date', () => {
    const parse = pg.types.getTypeParser(pg.types.builtins.DATE);

    // Bawaan driver menghasilkan Date tengah malam waktu lokal, yang mundur
    // sehari begitu diserialisasi ke UTC dari timezone positif seperti WIB.
    expect(parse('2026-08-17')).toBe('2026-08-17');
  });
});
