/**
 * Deteksi bahasa yang menandakan gangguan makan, krisis, atau kondisi medis.
 *
 * Ini **lapisan kedua**, bukan satu-satunya. Lapisan pertama adalah instruksi
 * di `coach.v1` yang menyuruh model memanggil `escalate_concern`. Deteksi
 * berbasis kata di sini menangkap kasus ketika model gagal melakukannya —
 * dan karena "guardrail keselamatan adalah syarat rilis, bukan fitur",
 * mengandalkan satu lapisan yang kebetulan probabilistik tidak cukup.
 *
 * Konsekuensi terdeteksi: **balasan tidak boleh memuat angka apa pun.**
 * Bukan sekadar tidak menyebut kalori — tidak ada angka target, sisa, maupun
 * berat. Aturan yang sama dengan layar guardrail onboarding.
 *
 * Batasan yang perlu jujur diakui: pencocokan kata selalu bisa dilewati dan
 * selalu bisa salah tangkap. Ini jaring pengaman, bukan diagnosis, dan
 * ambangnya sengaja dipasang ke arah "lebih baik salah menahan".
 */

export type ConcernSeverity = 'medical' | 'eating_disorder' | 'crisis';

export interface ConcernMatch {
  readonly severity: ConcernSeverity;
  /** Frasa yang memicu. Untuk log internal, tidak pernah ditampilkan ke user. */
  readonly trigger: string;
}

/**
 * Frasa dicocokkan pada teks yang sudah dinormalisasi (huruf kecil, tanda baca
 * jadi spasi), jadi "gak makan 3 hari" dan "Gak Makan 3 Hari!" sama saja.
 */
const PATTERNS: readonly { readonly severity: ConcernSeverity; readonly re: RegExp }[] = [
  // Krisis — didahulukan; ini yang paling tidak boleh terlewat.
  { severity: 'crisis', re: /\b(pengen|ingin|mau)\s+(mati|bunuh diri|ngakhirin hidup)\b/ },
  { severity: 'crisis', re: /\bbunuh diri\b/ },
  { severity: 'crisis', re: /\b(gak|nggak|tidak)\s+(kuat|sanggup)\s+(hidup|lagi)\b/ },

  // Gangguan makan.
  { severity: 'eating_disorder', re: /\b(muntahin|memuntahkan|dimuntahin|purging)\b/ },
  { severity: 'eating_disorder', re: /\bmuntah(in|kan)?\s+(lagi|abis|setelah|habis)\s+makan\b/ },
  { severity: 'eating_disorder', re: /\bobat\s+(pencahar|pelangsing)\b/ },
  // Dua urutan yang sama-sama umum: "gak makan 3 hari" dan "3 hari gak makan".
  {
    severity: 'eating_disorder',
    re: /\b(gak|nggak|tidak|belum|ga)\s+makan\s+\d+\s+hari\b/,
  },
  {
    severity: 'eating_disorder',
    re: /\b\d+\s+hari\s+(\w+\s+)?(gak|nggak|tidak|belum|ga)\s+makan\b/,
  },
  { severity: 'eating_disorder', re: /\bpuasa\s+\d{2,}\s+(hari|jam)\b/ },
  {
    severity: 'eating_disorder',
    re: /\b(benci|jijik|muak)\s+(sama\s+)?(badan|tubuh|diri)\s*(gue|ku|saya|aku)?\b/,
  },
  {
    severity: 'eating_disorder',
    re: /\b(merasa\s+)?(bersalah|berdosa)\s+(banget\s+)?(tiap|setiap|abis|habis|setelah)\s+makan\b/,
  },
  { severity: 'eating_disorder', re: /\bgemuk\s+banget\b.*\b(padahal|walau|meski)\b/ },

  // Medis — bukan penghentian total, tapi wajib mengarahkan ke tenaga kesehatan.
  { severity: 'medical', re: /\b(hamil|mengandung|menyusui)\b/ },
  {
    severity: 'medical',
    re: /\b(diabetes|diabetesi|gagal ginjal|penyakit ginjal|jantung|hipertensi|tiroid)\b/,
  },
  { severity: 'medical', re: /\b(kemoterapi|kemo)\b/ },
  { severity: 'medical', re: /\bobat\s+(dokter|resep)\b/ },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ORDER: Record<ConcernSeverity, number> = {
  crisis: 3,
  eating_disorder: 2,
  medical: 1,
};

/**
 * Mengembalikan kekhawatiran paling berat yang terdeteksi, atau `null`.
 *
 * Kalau sebuah pesan memicu beberapa pola sekaligus, yang menang adalah yang
 * paling berat — pesan tentang kehamilan yang juga menyebut memuntahkan
 * makanan bukan sekadar kasus medis.
 */
export function detectConcern(text: string): ConcernMatch | null {
  const t = normalize(text);
  let best: ConcernMatch | null = null;

  for (const p of PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    const candidate: ConcernMatch = { severity: p.severity, trigger: m[0] };
    if (!best || ORDER[candidate.severity] > ORDER[best.severity]) best = candidate;
  }
  return best;
}

/**
 * Balasan untuk kasus terdeteksi. **Tanpa angka apa pun** — dijaga test.
 *
 * Nada mengikuti aturan copy: menjelaskan, tidak menghakimi, dan tetap memberi
 * jalan keluar. Untuk kasus medis, coaching tidak dihentikan sepenuhnya;
 * untuk yang lain, dihentikan.
 */
export function concernReply(severity: ConcernSeverity): string {
  switch (severity) {
    case 'crisis':
      return (
        'Makasih udah cerita. Yang kamu rasain penting, dan aku bukan orang yang tepat buat ini. ' +
        'Tolong hubungi orang yang kamu percaya sekarang, atau layanan kesehatan jiwa terdekat. ' +
        'Aku bakal ada di sini kapan pun kamu siap lanjut soal makan.'
      );
    case 'eating_disorder':
      return (
        'Aku berhenti dulu ya soal angka. Yang kamu ceritain itu berat, dan bukan sesuatu yang ' +
        'sebaiknya dijawab dengan target kalori. Coba ngobrol sama tenaga kesehatan atau psikolog ' +
        'yang ngerti soal pola makan. Aku tetap di sini kalau kamu mau lanjut nanti.'
      );
    case 'medical':
      return (
        'Karena kondisi yang kamu sebut, sebaiknya target makan kamu ditentukan bareng dokter atau ' +
        'ahli gizi dulu. Aku bisa bantu catat apa yang kamu makan, tapi angka targetnya jangan dari aku ya.'
      );
  }
}

/** True bila kekhawatiran ini menghentikan coaching berbasis angka. */
export function blocksNumbers(severity: ConcernSeverity): boolean {
  return severity !== 'medical';
}
