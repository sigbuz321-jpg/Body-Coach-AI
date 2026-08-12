import { closePool, getPool, resolveFoodText } from '@bodycoach/db';

import { loadGolden, ringkas, scoreCase, type CaseResult } from './golden';

/**
 * Eval akurasi food matching (DoD M6).
 *
 * Dijalankan terhadap database yang sudah di-seed — bukan mock. Yang diukur
 * adalah kaskade resolver apa adanya, termasuk trigram di Postgres, karena
 * itulah yang akan dipakai pengguna. Eval yang berjalan di atas tiruan
 * database mengukur tiruan itu, bukan produknya.
 *
 * `pnpm evals`
 */

const AMBANG = 0.85;

function persen(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const cases = loadGolden();
  const db = getPool();
  const hasil: CaseResult[] = [];

  for (const kasus of cases) {
    const resolusi = await resolveFoodText(db, kasus.text);
    const actual = resolusi
      .filter((r) => r.kind === 'resolved')
      .map((r) => (r.kind === 'resolved' ? r.item.nameId : ''));
    hasil.push(scoreCase(kasus, actual));
  }

  const r = ringkas(hasil);

  const gagal = hasil.filter((h) => h.verdict !== 'benar');
  if (gagal.length > 0) {
    console.log(`\n── ${gagal.length} kasus gagal ${'─'.repeat(48)}`);
    for (const g of gagal) {
      console.log(
        `  #${String(g.kasus.id).padStart(3)} [${g.kasus.kategori}] ${JSON.stringify(g.kasus.text)}`,
      );
      console.log(
        `        harap: ${JSON.stringify(g.kasus.expect)}  dapat: ${JSON.stringify(g.actual)}`,
      );
    }
  }

  console.log(`\n── Ringkasan ${'─'.repeat(56)}`);
  for (const [kategori, k] of [...r.perKategori].sort()) {
    const tanda = k.benar === k.total ? ' ' : '!';
    console.log(
      `  ${tanda} ${kategori.padEnd(16)} ${String(k.benar).padStart(3)}/${String(k.total).padEnd(3)} ${persen(k.benar / k.total)}`,
    );
  }
  console.log(`  ${'─'.repeat(40)}`);
  console.log(
    `    akurasi kalimat  ${r.benar}/${r.total}  ${persen(r.akurasi)}   (ambang ${persen(AMBANG)})`,
  );
  console.log(`    akurasi item     ${r.itemCocok}/${r.itemDiharapkan}  ${persen(r.akurasiItem)}`);
  console.log(`    menebak makanan  ${r.menebak}  (kasus yang seharusnya kosong)`);

  await closePool();

  if (r.akurasi < AMBANG) {
    console.error(`\nGAGAL: akurasi ${persen(r.akurasi)} di bawah ambang ${persen(AMBANG)}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nLULUS: akurasi ${persen(r.akurasi)} >= ambang ${persen(AMBANG)}.`);
}

await main();
