/**
 * Normalisasi teks makanan sebelum masuk food resolver
 * (docs/02-technical-spec.md §5).
 *
 * Domain murni: tidak menyentuh database. Yang dihasilkan adalah kueri bersih
 * plus porsi yang disebut pengguna, keduanya dipakai tahap pencocokan.
 *
 * Kenapa ini penting: pengguna tidak mengetik "nasi goreng", mereka mengetik
 * "tadi gue makan nasgor seporsi". Tanpa normalisasi, tahap alias eksak
 * — tahap paling murah dan paling akurat — nyaris tidak pernah kena.
 */

/** Kata yang tidak menyumbang makna makanan dan mengganggu pencocokan. */
const STOPWORDS = new Set([
  'tadi',
  'barusan',
  'baru',
  'aja',
  'aku',
  'gue',
  'gw',
  'saya',
  'ku',
  'makan',
  'minum',
  'makanan',
  'sarapan',
  'siang',
  'malam',
  'pagi',
  'nya',
  'sih',
  'deh',
  'dong',
  'kok',
  'udah',
  'sudah',
  'abis',
  'habis',
  'sama',
  'dan',
  'dengan',
  'pakai',
  'pake',
  'plus',
  'terus',
  'lalu',
  'trus',
  'di',
  'ke',
  'dari',
  'yang',
]);

/**
 * Slang dan singkatan yang wajib ada (§5).
 *
 * Dipetakan sebelum stopword dibuang, karena sebagian di antaranya terdiri
 * dari beberapa kata yang salah satunya kebetulan stopword.
 */
const SLANG: readonly (readonly [RegExp, string])[] = [
  [/\bnasgor\b/g, 'nasi goreng'],
  [/\bnasi gor\b/g, 'nasi goreng'],
  [/\bgeprek\b/g, 'ayam geprek'],
  [/\bayam ayam geprek\b/g, 'ayam geprek'],
  [/\bindomie\b/g, 'mie instan goreng'],
  [/\bindomi\b/g, 'mie instan goreng'],
  [/\bmigor\b/g, 'mie instan goreng'],
  [/\bes teh manis\b/g, 'teh manis dingin'],
  [/\bestehmanis\b/g, 'teh manis dingin'],
  [/\bkopsus\b/g, 'es kopi susu'],
  [/\bkopi susu kekinian\b/g, 'es kopi susu'],
  [/\bpadang\b/g, 'nasi padang'],
  [/\bnasi nasi padang\b/g, 'nasi padang'],
  [/\bsotoayam\b/g, 'soto ayam'],
  [/\bgadogado\b/g, 'gado-gado'],
  [/\bmartabak manis\b/g, 'martabak manis'],
  [/\bterang bulan\b/g, 'martabak manis'],
];

/** Pengali porsi dari bahasa sehari-hari. */
const QUANTITY_WORDS: readonly (readonly [RegExp, number])[] = [
  [/\bsetengah\b|\bseparuh\b|\b1\/2\b|\b0[.,]5\b/, 0.5],
  [/\bseperempat\b|\b1\/4\b/, 0.25],
  [/\bsatu setengah\b|\b1[.,]5\b|\bsatu 1\/2\b/, 1.5],
  [/\bdua\b|\b2\b/, 2],
  [/\btiga\b|\b3\b/, 3],
  [
    /\bseporsi\b|\bsebungkus\b|\bsepiring\b|\bsemangkok\b|\bsemangkuk\b|\bsegelas\b|\bsatu\b|\b1\b/,
    1,
  ],
];

export interface NormalizedQuery {
  /** Teks bersih untuk dicocokkan ke alias/trigram. */
  readonly query: string;
  /**
   * Pengali porsi yang disebut pengguna, atau `null` bila tidak menyebut.
   * `null` berarti resolver memakai `food_portions.is_default`.
   */
  readonly portionMultiplier: number | null;
  /** Kutipan porsi asli, mis. "setengah porsi". Disimpan untuk audit. */
  readonly quantityText: string | null;
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Mendeteksi porsi yang disebut pengguna.
 *
 * Dicari pada teks sebelum stopword dibuang: "2 potong" kehilangan artinya
 * kalau "potong" ikut terbuang duluan.
 */
function detectQuantity(text: string): { multiplier: number | null; quote: string | null } {
  for (const [re, mult] of QUANTITY_WORDS) {
    const m = re.exec(text);
    if (m) {
      // Ambil satuan yang mengikuti angka, kalau ada, untuk kutipan.
      const after = text
        .slice(m.index)
        .match(/^\S+(\s+(porsi|potong|bungkus|piring|mangkok|gelas|tusuk))?/);
      return { multiplier: mult, quote: (after?.[0] ?? m[0]).trim() };
    }
  }
  return { multiplier: null, quote: null };
}

export function normalizeFoodQuery(raw: string): NormalizedQuery {
  let t = stripDiacritics(raw.toLowerCase())
    .replace(/[^\p{L}\p{N}\s/.,-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const { multiplier, quote } = detectQuantity(t);

  for (const [re, replacement] of SLANG) {
    t = t.replace(re, replacement);
  }

  const kata = t
    .split(' ')
    .map((w) => w.replace(/^[.,-]+|[.,-]+$/g, ''))
    // Angka dan satuan porsi dibuang dari kueri: yang dicari nama makanan,
    // bukan berapa banyaknya. Jumlahnya sudah ditangkap di portionMultiplier.
    .filter((w) => w.length > 0 && !/^\d+([.,/]\d+)?$/.test(w))
    .filter((w) => !STOPWORDS.has(w))
    .filter(
      (w) => !/^(porsi|potong|bungkus|piring|mangkok|mangkuk|gelas|tusuk|butir|buah)$/.test(w),
    )
    .filter(
      (w) =>
        !/^(setengah|separuh|seperempat|seporsi|sebungkus|sepiring|semangkok|semangkuk|segelas|satu|dua|tiga)$/.test(
          w,
        ),
    );

  return {
    query: kata.join(' '),
    portionMultiplier: multiplier,
    quantityText: quote,
  };
}

/**
 * Memecah kalimat menjadi beberapa makanan.
 *
 * "nasi sama ayam geprek" harus jadi dua item terpisah, bukan satu kueri
 * "nasi ayam geprek" yang tidak akan cocok dengan apa pun. Pemisahnya adalah
 * kata sambung yang benar-benar dipakai untuk mendaftar makanan.
 */
export function splitFoodItems(raw: string): string[] {
  return (
    raw
      // "sama" adalah kata sambung di "nasi sama ayam", tapi bukan di "sama
      // sekali" — idiom yang berarti "langsung tidak ada". Tanpa pengecualian
      // ini, "nggak ada sama sekali" pecah jadi dua kueri makanan.
      .split(
        /\s*(?:,|\+|\bsama\b(?!\s+sekali)|\bdan\b|\bdengan\b|\bplus\b|\bterus\b|\btrus\b|\blalu\b)\s*/i,
      )
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

/** Nilai gizi per 100 gram, apa adanya dari food database. */
export interface Per100g {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
}

export interface Nutrition {
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
}

/**
 * Menghitung gizi satu porsi dari nilai per 100 gram.
 *
 * Fungsi aritmetika, sengaja di domain murni: inilah satu-satunya tempat
 * konversi ini boleh terjadi. Kalau tersebar, dua layar bisa menampilkan dua
 * angka untuk makanan yang sama — persis kelas kesalahan yang AD-1 cegah.
 *
 * Pembulatan ke bilangan bulat dilakukan di sini, bukan di lapisan tampilan,
 * supaya angka yang disimpan ke `food_log_items` sama dengan yang ditampilkan.
 */
export function nutritionForGrams(per100g: Per100g, grams: number): Nutrition {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    proteinG: Math.round(per100g.proteinG * f),
    carbsG: Math.round(per100g.carbsG * f),
    fatG: Math.round(per100g.fatG * f),
  };
}
