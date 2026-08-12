import { describe, expect, it } from 'vitest';

import { loadGolden, ringkas, scoreCase, type GoldenCase } from './golden';

/**
 * Yang paling mudah salah di sebuah eval bukan querynya, melainkan cara
 * menghitung skornya. Eval yang menilai dirinya terlalu longgar lebih
 * berbahaya daripada tidak punya eval sama sekali — ia memberi angka yang
 * menenangkan sambil menutupi kegagalan.
 */

function kasus(over: Partial<GoldenCase> = {}): GoldenCase {
  return { id: 1, kategori: 'uji', text: 'nasi goreng', expect: ['Nasi goreng'], ...over };
}

describe('scoreCase', () => {
  it('benar hanya kalau himpunannya sama persis', () => {
    expect(scoreCase(kasus(), ['Nasi goreng']).verdict).toBe('benar');
  });

  it('mengabaikan urutan — itu bukan janji produk', () => {
    const k = kasus({ expect: ['Nasi putih', 'Ayam geprek'] });
    expect(scoreCase(k, ['Ayam geprek', 'Nasi putih']).verdict).toBe('benar');
  });

  it('menandai makanan yang salah sebagai salah, bukan kurang', () => {
    const r = scoreCase(kasus(), ['Nasi uduk']);
    expect(r.verdict).toBe('salah');
    expect(r.hilang).toEqual(['Nasi goreng']);
    expect(r.asing).toEqual(['Nasi uduk']);
  });

  it('membedakan kurang item dari salah item', () => {
    const k = kasus({ expect: ['Nasi putih', 'Ayam geprek'] });
    expect(scoreCase(k, ['Nasi putih']).verdict).toBe('lolos-tapi-kurang');
  });

  it('menandai item berlebih walau yang diharapkan semuanya keluar', () => {
    const k = kasus({ expect: ['Nasi putih'] });
    const r = scoreCase(k, ['Nasi putih', 'Sate ayam']);
    expect(r.verdict).toBe('kelebihan');
    expect(r.asing).toEqual(['Sate ayam']);
  });

  it('kasus yang seharusnya kosong gagal begitu ada satu makanan keluar', () => {
    const k = kasus({ expect: [] });
    expect(scoreCase(k, []).verdict).toBe('benar');
    expect(scoreCase(k, ['Nasi goreng']).verdict).toBe('kelebihan');
  });
});

describe('ringkas', () => {
  it('menghitung kasus menebak terpisah dari akurasi', () => {
    const r = ringkas([
      scoreCase(kasus({ id: 1, expect: [] }), ['Nasi goreng']),
      scoreCase(kasus({ id: 2 }), ['Nasi goreng']),
    ]);

    expect(r.total).toBe(2);
    expect(r.benar).toBe(1);
    expect(r.akurasi).toBe(0.5);
    // Menebak adalah kegagalan paling mahal: kalori yang tidak pernah dimakan
    // masuk ke rekap harian, dan pengguna tidak punya cara tahu.
    expect(r.menebak).toBe(1);
  });

  it('akurasi item terpisah dari akurasi kalimat', () => {
    // Satu dari dua item benar: kalimatnya gagal, itemnya setengah.
    const r = ringkas([scoreCase(kasus({ expect: ['Nasi putih', 'Bakso'] }), ['Nasi putih'])]);
    expect(r.akurasi).toBe(0);
    expect(r.akurasiItem).toBe(0.5);
  });

  it('nol kasus tidak menghasilkan pembagian nol', () => {
    const r = ringkas([]);
    expect(r.akurasi).toBe(0);
    expect(r.akurasiItem).toBe(0);
  });
});

describe('golden-200.json', () => {
  const cases = loadGolden();

  it('berisi tepat 200 kasus', () => {
    expect(cases).toHaveLength(200);
  });

  it('id-nya unik', () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(200);
  });

  it('teksnya unik — kasus kembar membuat angkanya menipu', () => {
    const teks = cases.map((c) => c.text.toLowerCase());
    expect(new Set(teks).size).toBe(200);
  });

  it('punya kasus yang seharusnya TIDAK cocok', () => {
    // Tanpa ini, resolver yang selalu menebak bisa mencetak 100%.
    expect(cases.filter((c) => c.expect.length === 0).length).toBeGreaterThanOrEqual(5);
  });

  it('mencakup slang wajib §5', () => {
    const semua = cases.map((c) => c.text).join(' | ');
    for (const wajib of [
      'nasgor',
      'geprek',
      'indomie',
      'setengah porsi',
      '2 potong',
      'seporsi',
      'sebungkus',
    ]) {
      expect(semua).toContain(wajib);
    }
  });
});
