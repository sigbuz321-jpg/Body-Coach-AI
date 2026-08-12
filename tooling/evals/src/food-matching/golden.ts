import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pemuatan dan penilaian golden set food matching.
 *
 * Penilaiannya dipisah dari runner-nya supaya bisa dites tanpa database:
 * yang paling mudah salah di eval bukan querynya, melainkan cara menghitung
 * skornya. Eval yang menilai dirinya terlalu longgar lebih berbahaya daripada
 * tidak punya eval sama sekali — ia memberi angka yang menenangkan.
 */

export interface GoldenCase {
  readonly id: number;
  readonly kategori: string;
  readonly text: string;
  /** Himpunan `name_id` yang seharusnya keluar. Kosong = tidak boleh cocok. */
  readonly expect: readonly string[];
}

interface GoldenFile {
  readonly versi: number;
  readonly cases: readonly GoldenCase[];
}

export function loadGolden(): readonly GoldenCase[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, 'golden-200.json'), 'utf8');
  return (JSON.parse(raw) as GoldenFile).cases;
}

export type Verdict = 'benar' | 'salah' | 'lolos-tapi-kurang' | 'kelebihan';

export interface CaseResult {
  readonly kasus: GoldenCase;
  readonly actual: readonly string[];
  readonly verdict: Verdict;
  /** Item yang diharapkan tapi tidak keluar. */
  readonly hilang: readonly string[];
  /** Item yang keluar tapi tidak diharapkan. */
  readonly asing: readonly string[];
}

/**
 * Menilai satu kasus.
 *
 * Himpunan, bukan urutan: urutan item dalam satu kalimat bukan janji produk.
 * Duplikat diabaikan — "nasi sama nasi" bukan kasus yang perlu dibedakan di
 * sini, dan menghitungnya justru mengaburkan kegagalan yang nyata.
 */
export function scoreCase(kasus: GoldenCase, actual: readonly string[]): CaseResult {
  const diharapkan = new Set(kasus.expect);
  const keluar = new Set(actual);

  const hilang = [...diharapkan].filter((n) => !keluar.has(n));
  const asing = [...keluar].filter((n) => !diharapkan.has(n));

  let verdict: Verdict;
  if (hilang.length === 0 && asing.length === 0) verdict = 'benar';
  else if (hilang.length === 0) verdict = 'kelebihan';
  else if (asing.length === 0 && diharapkan.size > 0) verdict = 'lolos-tapi-kurang';
  else verdict = 'salah';

  return { kasus, actual, verdict, hilang, asing };
}

export interface Ringkasan {
  readonly total: number;
  /** Kasus yang himpunannya cocok persis. Ini angka DoD M6 (>= 85%). */
  readonly benar: number;
  readonly akurasi: number;
  /** Per item, bukan per kalimat — berguna melihat seberapa dekat kegagalannya. */
  readonly itemDiharapkan: number;
  readonly itemCocok: number;
  readonly akurasiItem: number;
  /**
   * Kasus `expect: []` yang malah menghasilkan makanan. Dipisah karena ini
   * kegagalan paling mahal: kalori yang tidak pernah dimakan masuk ke rekap.
   */
  readonly menebak: number;
  readonly perKategori: ReadonlyMap<string, { benar: number; total: number }>;
}

export function ringkas(hasil: readonly CaseResult[]): Ringkasan {
  const perKategori = new Map<string, { benar: number; total: number }>();
  let benar = 0;
  let itemDiharapkan = 0;
  let itemCocok = 0;
  let menebak = 0;

  for (const r of hasil) {
    const k = perKategori.get(r.kasus.kategori) ?? { benar: 0, total: 0 };
    k.total++;
    if (r.verdict === 'benar') {
      benar++;
      k.benar++;
    }
    perKategori.set(r.kasus.kategori, k);

    itemDiharapkan += r.kasus.expect.length;
    itemCocok += r.kasus.expect.length - r.hilang.length;

    if (r.kasus.expect.length === 0 && r.actual.length > 0) menebak++;
  }

  return {
    total: hasil.length,
    benar,
    akurasi: hasil.length === 0 ? 0 : benar / hasil.length,
    itemDiharapkan,
    itemCocok,
    akurasiItem: itemDiharapkan === 0 ? 0 : itemCocok / itemDiharapkan,
    menebak,
    perKategori,
  };
}
