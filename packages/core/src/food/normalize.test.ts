import { describe, expect, it } from 'vitest';

import { normalizeFoodQuery, splitFoodItems } from './normalize';

describe('normalisasi yang ditemukan lewat eval', () => {
  it('"indomie rebus" tidak berubah jadi mie goreng', () => {
    // Aturan `indomie` polos dulu menang lebih awal dan menghasilkan "mie
    // instan goreng rebus": pengguna yang makan mie kuah dicatat makan mie
    // goreng, dua makanan dengan lemak yang jauh berbeda.
    expect(normalizeFoodQuery('indomie rebus').query).toBe('mie instan kuah');
    expect(normalizeFoodQuery('indomie kuah').query).toBe('mie instan kuah');
    expect(normalizeFoodQuery('mie rebus').query).toBe('mie instan kuah');
  });

  it('"indomie" polos tetap mie goreng', () => {
    expect(normalizeFoodQuery('indomie').query).toBe('mie instan goreng');
    expect(normalizeFoodQuery('sebungkus indomie').query).toBe('mie instan goreng');
  });

  it('membuang kata kerja ngemil', () => {
    // "tadi ngemil cireng" dulu menyisakan "ngemil cireng" dan trigramnya
    // jatuh di bawah ambang — camilan justru paling sering tidak tercatat.
    expect(normalizeFoodQuery('tadi ngemil cireng').query).toBe('cireng');
    expect(normalizeFoodQuery('nyemil pisang goreng').query).toBe('pisang goreng');
  });
});

describe('normalizeFoodQuery', () => {
  it('membuang stopword percakapan', () => {
    expect(normalizeFoodQuery('tadi gue makan nasi padang').query).toBe('nasi padang');
  });

  it('menerjemahkan slang wajib §5', () => {
    expect(normalizeFoodQuery('nasgor').query).toBe('nasi goreng');
    expect(normalizeFoodQuery('geprek').query).toBe('ayam geprek');
    expect(normalizeFoodQuery('indomie').query).toBe('mie instan goreng');
    expect(normalizeFoodQuery('es teh manis').query).toBe('teh manis dingin');
  });

  it('tidak menggandakan kata saat slang mengandung kata yang sudah ada', () => {
    expect(normalizeFoodQuery('nasi padang').query).toBe('nasi padang');
    expect(normalizeFoodQuery('ayam geprek').query).toBe('ayam geprek');
  });

  it('menangkap porsi setengah', () => {
    const n = normalizeFoodQuery('setengah porsi nasi goreng');
    expect(n.portionMultiplier).toBe(0.5);
    expect(n.query).toBe('nasi goreng');
  });

  it('menangkap porsi berupa angka', () => {
    const n = normalizeFoodQuery('2 potong ayam geprek');
    expect(n.portionMultiplier).toBe(2);
    expect(n.query).toBe('ayam geprek');
    expect(n.quantityText).toContain('2');
  });

  it('seporsi berarti satu', () => {
    expect(normalizeFoodQuery('seporsi bakso').portionMultiplier).toBe(1);
  });

  it('porsi null saat pengguna tidak menyebut jumlah', () => {
    // null berarti "pakai porsi default dari food_portions", bukan "nol".
    expect(normalizeFoodQuery('bakso').portionMultiplier).toBeNull();
  });

  it('angka dan satuan tidak ikut ke kueri pencocokan', () => {
    expect(normalizeFoodQuery('3 tusuk sate ayam').query).toBe('sate ayam');
  });

  it('tidak peduli huruf besar dan tanda baca', () => {
    expect(normalizeFoodQuery('NASI PADANG!!!').query).toBe('nasi padang');
  });

  it('teks kosong tidak melempar', () => {
    expect(normalizeFoodQuery('').query).toBe('');
    expect(normalizeFoodQuery('   ').query).toBe('');
  });
});

describe('splitFoodItems', () => {
  it('memecah "nasi sama ayam geprek" jadi dua item', () => {
    // DoD M5: kalimat ini harus menghasilkan dua item terpisah, bukan satu
    // kueri gabungan yang tidak cocok dengan apa pun.
    expect(splitFoodItems('nasi sama ayam geprek')).toEqual(['nasi', 'ayam geprek']);
  });

  it('memecah pada koma dan tanda plus', () => {
    expect(splitFoodItems('nasi, ayam geprek + es teh')).toEqual(['nasi', 'ayam geprek', 'es teh']);
  });

  it('memecah pada "dan" dan "dengan"', () => {
    expect(splitFoodItems('bakso dan es teh')).toEqual(['bakso', 'es teh']);
    expect(splitFoodItems('nasi dengan rendang')).toEqual(['nasi', 'rendang']);
  });

  it('tidak memecah idiom "sama sekali"', () => {
    // Ditemukan saat menguji resolver ke database nyata: "nggak ada sama
    // sekali" terpecah jadi dua kueri makanan.
    expect(splitFoodItems('nggak ada sama sekali')).toEqual(['nggak ada sama sekali']);
  });

  it('kalimat satu makanan tetap satu item', () => {
    expect(splitFoodItems('nasi padang')).toEqual(['nasi padang']);
  });

  it('tidak menghasilkan item kosong', () => {
    expect(splitFoodItems('nasi,,  + ')).toEqual(['nasi']);
  });
});

describe('alur gabungan — kalimat DoD M5', () => {
  it('"Tadi gue makan nasi sama ayam geprek" menghasilkan dua kueri bersih', () => {
    const hasil = splitFoodItems('Tadi gue makan nasi sama ayam geprek').map(
      (s) => normalizeFoodQuery(s).query,
    );
    expect(hasil).toEqual(['nasi', 'ayam geprek']);
  });
});
