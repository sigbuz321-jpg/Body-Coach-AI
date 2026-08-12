/**
 * Tanggal dan jam lokal pengguna.
 *
 * `local_date` adalah sumbu utama produk ini — total harian, adherence, dan
 * rekap malam semuanya bergantung padanya. Menghitungnya dari `new Date()`
 * di proses server berarti pengguna WIB yang mencatat makan malam jam 20:00
 * masuk ke tanggal kemarin ketika servernya berjalan di UTC.
 *
 * Fungsi di sini murni: waktu masuk sebagai argumen, tidak pernah dibaca
 * sendiri. Yang membaca jam adalah pemanggil di lapisan I/O.
 */

export interface LocalMoment {
  /** `YYYY-MM-DD` di timezone pengguna. */
  readonly date: string;
  /** Jam 0–23 di timezone pengguna. */
  readonly hour: number;
}

/**
 * `en-CA` menghasilkan `YYYY-MM-DD` apa adanya, jadi tidak perlu menyusun
 * ulang bagian-bagiannya. `hourCycle: 'h23'` mencegah tengah malam terbaca
 * sebagai jam 24 — nilai yang dikembalikan sebagian runtime untuk `h24`.
 */
const CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = CACHE.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    CACHE.set(timeZone, f);
  }
  return f;
}

export function localMoment(now: Date, timeZone = 'Asia/Jakarta'): LocalMoment {
  const parts = formatter(timeZone).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}

/**
 * Menggeser tanggal `YYYY-MM-DD` sejumlah hari.
 *
 * Aritmetikanya dilakukan di UTC dan hasilnya dirakit kembali sebagai string.
 * Tanggal tidak pernah menyentuh timezone lokal proses — itu justru sumber
 * pergeseran satu hari yang ingin dihindari.
 */
export function shiftDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + deltaDays * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
