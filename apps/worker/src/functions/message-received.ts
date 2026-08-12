import {
  blocksNumbers,
  buildUserContextBlock,
  concernReply,
  detectConcern,
  localMoment,
  looksLikeQuestion,
  mealSlotForHour,
  NEEDS_CHECK_BELOW,
  parseWeightMessage,
  renderDeterministicTemplate,
  renderFoodLogPreview,
  renderLogCancelled,
  renderLogConfirmed,
  renderNoFoodFound,
  renderNotLinked,
  renderPaired,
  renderPairFailure,
  renderPortionPrompt,
  renderWeightSaved,
  truthFromContext,
  verifyCoachNumbers,
  type CoachContext,
  type ConcernSeverity,
  type LocalMoment,
  type LoggedItemView,
  type PairFailure,
} from '@bodycoach/core';
import { parsePairingMessage, type FoodResolution, type MessageJob } from '@bodycoach/db';
import { foodConfirmButtons, hashWaId, parseButtonId } from '@bodycoach/whatsapp';

/**
 * `message.received` — satu-satunya tempat pesan WhatsApp benar-benar diproses.
 *
 * Handler webhook hanya menaruh job di antrean lalu balas 200 (AD-2). Semua
 * yang lambat — query database, food resolver, pemanggilan LLM, pengiriman
 * balasan — terjadi di sini.
 *
 * ── Kenapa dependensinya disuntik ──
 *
 * Seluruh isi file ini adalah keputusan: pesan ini pairing atau bukan, ini
 * pertanyaan atau laporan makan, angka balasan cocok atau tidak. Keputusan
 * itulah yang paling perlu dites, dan menguji keputusan tidak boleh menuntut
 * Postgres, Redis, Meta, dan MiniMax hidup sekaligus. `Store`, `Messenger`,
 * dan `CoachRunner` sengaja sempit: hanya operasi yang benar-benar dipakai.
 *
 * ── Urutan pemeriksaan, dan kenapa urutannya begitu ──
 *
 * 1. Kunci per pengguna    — pesan beruntun satu orang diproses berurutan (§7).
 * 2. Pairing               — sebelum apa pun; nomornya belum tentu dikenal.
 * 3. Nomor tidak tertaut   — berhenti, tanpa satu angka pun.
 * 4. Tombol interaktif     — bukan teks, tidak perlu lewat resolver.
 * 5. Guardrail keselamatan — SEBELUM logging dan sebelum LLM. Ini syarat rilis.
 * 6. Update berat          — sebelum food resolver, kalau tidak "berat gue 70kg"
 *                            dicocokkan sebagai makanan.
 * 7. Pertanyaan            — sebelum food resolver, alasan sama.
 * 8. Pencatatan makanan    — jalur utama.
 */

export interface Messenger {
  sendText(to: string, body: string): Promise<{ messageId: string }>;
  sendInteractive(msg: {
    to: string;
    body: string;
    footer?: string;
    buttons: readonly { id: string; title: string }[];
  }): Promise<{ messageId: string }>;
}

export interface CoachAnswer {
  readonly text: string;
  readonly toolCalls: readonly { name: string; arguments: Record<string, unknown> }[];
}

export interface CoachRunner {
  /**
   * `contextBlock` adalah hasil `buildUserContextBlock`, bukan system prompt
   * utuh. Penyusunan promptnya milik `@bodycoach/ai` yang memegang versinya
   * (`coach.v1`); worker tidak boleh ikut menentukan bunyi prompt.
   */
  ask(input: { contextBlock: string; userText: string }): Promise<CoachAnswer>;
}

export type PairOutcome =
  { readonly kind: 'paired'; readonly userId: string } | { readonly kind: PairFailure };

export interface Store {
  findUserIdByWaId(waId: string): Promise<string | null>;
  pairToken(token: string, waId: string): Promise<PairOutcome>;
  /** `null` bila profil atau target belum ada — onboarding belum tuntas. */
  loadContext(userId: string, localDate: string, hourWib: number): Promise<CoachContext | null>;
  resolveFood(text: string): Promise<readonly FoodResolution[]>;
  /**
   * Membuat log berstatus `pending`. `null` bila `source_message_id` sudah
   * dipakai — pesan ini sudah pernah diproses (lapis kedua idempotency).
   */
  createPendingLog(input: {
    userId: string;
    localDate: string;
    mealSlot: string;
    sourceMessageId: string;
    items: readonly FoodResolution[];
  }): Promise<string | null>;
  setLogStatus(input: {
    logId: string;
    userId: string;
    status: 'confirmed' | 'discarded';
  }): Promise<boolean>;
  recordMessage(input: {
    userId: string;
    waMessageId: string | null;
    direction: 'inbound' | 'outbound';
    kind: 'text' | 'image' | 'interactive';
    body?: string;
  }): Promise<void>;
  latestWeightKg(userId: string): Promise<number | null>;
  saveWeight(userId: string, localDate: string, kg: number): Promise<void>;
}

export interface LockManager {
  acquire(keyHash: string): Promise<{ release: () => Promise<void> } | null>;
}

export interface MessageDeps {
  readonly store: Store;
  readonly messenger: Messenger;
  /** `null` saat AI_PROVIDER_KEY belum diisi — jalur deterministik tetap jalan. */
  readonly coach: CoachRunner | null;
  readonly lock: LockManager;
  readonly requeue: (job: MessageJob) => Promise<void>;
  readonly now: () => Date;
  readonly appUrl: string;
  readonly timeZone?: string;
}

export type MessageOutcome =
  | { readonly kind: 'deferred' }
  | { readonly kind: 'ignored'; readonly reason: string }
  | { readonly kind: 'not_linked' }
  | { readonly kind: 'paired'; readonly userId: string }
  | { readonly kind: 'pair_failed'; readonly reason: PairFailure }
  | { readonly kind: 'onboarding_incomplete' }
  | { readonly kind: 'concern'; readonly severity: ConcernSeverity }
  | { readonly kind: 'weight_saved'; readonly kg: number }
  | { readonly kind: 'logged'; readonly logId: string; readonly items: number }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'no_food' }
  | { readonly kind: 'log_confirmed' }
  | { readonly kind: 'log_cancelled' }
  | { readonly kind: 'log_portion' }
  | { readonly kind: 'log_stale' }
  | { readonly kind: 'answered'; readonly fallback: boolean };

/** Balasan teks + pencatatannya ke `messages`. */
type Balas = (userId: string | null, body: string) => Promise<void>;

/** Segala yang dibawa turun ke setiap cabang. */
interface Sesi {
  readonly deps: MessageDeps;
  readonly job: MessageJob;
  readonly userId: string;
  readonly ctx: CoachContext;
  readonly saat: LocalMoment;
  /** Catatan medis yang wajib mendahului balasan, atau string kosong. */
  readonly catatanMedis: string;
  readonly balas: Balas;
}

/** Bentuk tampilan dari hasil resolver. Konversi satu arah, tanpa I/O. */
function toView(r: FoodResolution): LoggedItemView | null {
  if (r.kind !== 'resolved') return null;
  const i = r.item;
  return {
    label: i.nameId,
    grams: i.grams,
    kcal: i.nutrition.kcal,
    proteinG: i.nutrition.proteinG,
    carbsG: i.nutrition.carbsG,
    fatG: i.nutrition.fatG,
    needsCheck: i.confidence < NEEDS_CHECK_BELOW,
  };
}

export async function handleMessageReceived(
  deps: MessageDeps,
  job: MessageJob,
): Promise<MessageOutcome> {
  const held = await deps.lock.acquire(hashWaId(job.waId));
  if (!held) {
    // Pengguna yang sama sedang diproses instance lain. Job dikembalikan ke
    // antrean, bukan dibuang dan bukan diproses paralel — urutan pesan adalah
    // bagian dari kebenaran total hariannya.
    await deps.requeue(job);
    return { kind: 'deferred' };
  }

  try {
    return await proses(deps, job);
  } finally {
    await held.release();
  }
}

async function proses(deps: MessageDeps, job: MessageJob): Promise<MessageOutcome> {
  const { store, messenger } = deps;
  const saat = localMoment(deps.now(), deps.timeZone);
  const teks = (job.body ?? '').trim();

  const balas: Balas = async (userId, body) => {
    const res = await messenger.sendText(job.waId, body);
    if (userId) {
      await store.recordMessage({
        userId,
        waMessageId: res.messageId || null,
        direction: 'outbound',
        kind: 'text',
        body,
      });
    }
  };

  // ── 2. Pairing ────────────────────────────────────────────────────────────
  const token = parsePairingMessage(teks);
  if (token) {
    const hasil = await store.pairToken(token, job.waId);
    if (hasil.kind !== 'paired') {
      await balas(null, renderPairFailure(hasil.kind, deps.appUrl));
      return { kind: 'pair_failed', reason: hasil.kind };
    }

    await store.recordMessage({
      userId: hasil.userId,
      waMessageId: job.messageId,
      direction: 'inbound',
      kind: 'text',
      body: teks,
    });

    const ctx = await store.loadContext(hasil.userId, saat.date, saat.hour);
    // Tanpa target, sambutan tidak boleh menyebut angka apa pun.
    await balas(
      hasil.userId,
      ctx
        ? renderPaired(ctx)
        : 'Nomor kamu udah nyambung. Selesaikan dulu pengaturan awalnya di web ya, ' +
            'biar targetnya bisa dihitung.',
    );
    return { kind: 'paired', userId: hasil.userId };
  }

  // ── 3. Nomor belum tertaut ────────────────────────────────────────────────
  const userId = await store.findUserIdByWaId(job.waId);
  if (!userId) {
    await balas(null, renderNotLinked(deps.appUrl));
    return { kind: 'not_linked' };
  }

  await store.recordMessage({
    userId,
    waMessageId: job.messageId,
    direction: 'inbound',
    kind: job.type === 'image' ? 'image' : job.buttonId ? 'interactive' : 'text',
    ...(teks ? { body: teks } : {}),
  });

  const ctx = await store.loadContext(userId, saat.date, saat.hour);
  if (!ctx) {
    await balas(
      userId,
      'Pengaturan awal kamu belum tuntas, jadi targetnya belum ada. ' +
        `Selesaikan dulu di ${deps.appUrl} ya, habis itu tinggal lanjut di sini.`,
    );
    return { kind: 'onboarding_incomplete' };
  }

  const sesi: Sesi = { deps, job, userId, ctx, saat, catatanMedis: '', balas };

  // ── 4. Tombol interaktif ──────────────────────────────────────────────────
  if (job.buttonId) return tekanTombol(sesi);

  if (job.type === 'image') {
    // Analisis foto adalah M7. Sampai itu ada, jawab jujur — bukan diam, dan
    // bukan pura-pura memproses.
    await balas(
      userId,
      'Foto belum bisa gue baca, itu nyusul. Sementara ketik aja makanannya, ' +
        'misal "nasi padang sama teh manis".',
    );
    return { kind: 'ignored', reason: 'image_belum_didukung' };
  }

  if (teks.length === 0) {
    await balas(userId, 'Belum kebaca isinya. Coba ketik makanannya, atau tanya apa aja.');
    return { kind: 'ignored', reason: 'kosong' };
  }

  // ── 5. Guardrail keselamatan ──────────────────────────────────────────────
  // Sebelum logging dan sebelum LLM. Hasil yang memblokir tidak boleh
  // mengembalikan angka apa pun — aturan yang sama dengan guardrail onboarding.
  const concern = detectConcern(teks);
  if (concern && blocksNumbers(concern.severity)) {
    await balas(userId, concernReply(concern.severity));
    return { kind: 'concern', severity: concern.severity };
  }
  // Kasus medis tidak menghentikan coaching (§ concern.blocksNumbers), tapi
  // arahan ke tenaga kesehatan wajib mendahului setiap balasan berikutnya.
  const lanjut: Sesi = concern
    ? { ...sesi, catatanMedis: `${concernReply(concern.severity)}\n\n` }
    : sesi;

  // ── 6. Update berat ───────────────────────────────────────────────────────
  const beratKg = parseWeightMessage(teks);
  if (beratKg !== null) {
    const sebelum = await store.latestWeightKg(userId);
    await store.saveWeight(userId, saat.date, beratKg);
    await balas(userId, lanjut.catatanMedis + renderWeightSaved(beratKg, sebelum));
    return { kind: 'weight_saved', kg: beratKg };
  }

  // ── 7. Pertanyaan ─────────────────────────────────────────────────────────
  if (looksLikeQuestion(teks)) return jawabPertanyaan(lanjut, teks);

  // ── 8. Pencatatan makanan ─────────────────────────────────────────────────
  return catatMakanan(lanjut, teks, { bolehTanyaCoach: true });
}

async function tekanTombol(sesi: Sesi): Promise<MessageOutcome> {
  const { deps, job, userId, saat, balas } = sesi;
  const aksi = parseButtonId(job.buttonId ?? '');
  if (aksi.kind === 'unknown') {
    await balas(userId, 'Tombolnya nggak kebaca. Ketik aja makanannya ya.');
    return { kind: 'ignored', reason: 'tombol_tidak_dikenal' };
  }

  const status = aksi.kind === 'confirm' ? 'confirmed' : 'discarded';
  const berhasil = await deps.store.setLogStatus({ logId: aksi.logId, userId, status });

  if (!berhasil) {
    // Tombol lama di riwayat chat, atau Meta mengirim ulang. Log yang sudah
    // selesai tidak boleh berpindah status lagi.
    await balas(userId, 'Yang itu udah diproses sebelumnya. Nggak gue ubah lagi ya.');
    return { kind: 'log_stale' };
  }

  if (aksi.kind === 'cancel') {
    await balas(userId, renderLogCancelled());
    return { kind: 'log_cancelled' };
  }
  if (aksi.kind === 'portion') {
    await balas(userId, renderPortionPrompt());
    return { kind: 'log_portion' };
  }

  // Konteks dimuat ULANG setelah status berubah: sisa target yang dikirim
  // harus sudah memperhitungkan log yang baru saja dikonfirmasi.
  const ctx = await deps.store.loadContext(userId, saat.date, saat.hour);
  await balas(userId, ctx ? renderLogConfirmed(ctx) : 'Tercatat.');
  return { kind: 'log_confirmed' };
}

async function catatMakanan(
  sesi: Sesi,
  teks: string,
  opts: { bolehTanyaCoach: boolean },
): Promise<MessageOutcome> {
  const { deps, job, userId, ctx, saat, catatanMedis, balas } = sesi;

  const hasil = await deps.store.resolveFood(teks);
  const resolved = hasil.filter((r) => r.kind === 'resolved');
  const unresolved = hasil.filter((r) => r.kind === 'unresolved').map((r) => r.item.rawLabel);

  if (resolved.length === 0) {
    // Tidak ada yang dikenali. Kalau coach hidup, biarkan dia menjawab —
    // kalimatnya mungkin memang bukan tentang makanan. `bolehTanyaCoach`
    // mencegah putaran: jalur ini juga dimasuki DARI coach.
    if (opts.bolehTanyaCoach && deps.coach) return jawabPertanyaan(sesi, teks);
    await balas(userId, catatanMedis + renderNoFoodFound());
    return { kind: 'no_food' };
  }

  const logId = await deps.store.createPendingLog({
    userId,
    // Tanggal diambil dari momen yang sama dengan yang dipakai memuat konteks.
    // Menghitungnya ulang di sini berisiko: job yang diproses tepat di
    // pergantian hari bisa menyimpan log ke tanggal yang berbeda dari sisa
    // target yang dikirim bersamanya.
    localDate: saat.date,
    mealSlot: mealSlotForHour(ctx.hourWib),
    sourceMessageId: job.messageId,
    items: resolved,
  });

  if (!logId) {
    // `source_message_id` sudah dipakai: pesan ini sudah pernah diproses dan
    // balasannya sudah terkirim. Membalas lagi berarti pengguna menerima dua
    // pesan untuk satu kalimat.
    return { kind: 'duplicate' };
  }

  const items = resolved.map(toView).filter((v): v is LoggedItemView => v !== null);
  const body = catatanMedis + renderFoodLogPreview({ ctx, items, unresolved });

  const res = await deps.messenger.sendInteractive({
    to: job.waId,
    body,
    footer: 'Cek dulu, baru Catat.',
    buttons: foodConfirmButtons(logId).map((b) => ({ id: b.id, title: b.title })),
  });
  await deps.store.recordMessage({
    userId,
    waMessageId: res.messageId || null,
    direction: 'outbound',
    kind: 'interactive',
    body,
  });

  return { kind: 'logged', logId, items: items.length };
}

async function jawabPertanyaan(sesi: Sesi, teks: string): Promise<MessageOutcome> {
  const { deps, job, userId, ctx, catatanMedis, balas } = sesi;

  if (!deps.coach) {
    // Tanpa provider AI, produk tetap menjawab — dengan angka engine dan satu
    // langkah berikutnya. Yang hilang cuma kalimatnya, bukan gunanya.
    await balas(userId, catatanMedis + renderDeterministicTemplate(ctx));
    return { kind: 'answered', fallback: true };
  }

  let jawaban: CoachAnswer;
  try {
    jawaban = await deps.coach.ask({
      contextBlock: buildUserContextBlock(ctx),
      userText: teks,
    });
  } catch (err) {
    // Provider mati bukan alasan pengguna tidak dijawab.
    console.error('[message.received] coach gagal', hashWaId(job.waId), err);
    await balas(userId, catatanMedis + renderDeterministicTemplate(ctx));
    return { kind: 'answered', fallback: true };
  }

  // Guardrail lapis pertama: model sendiri yang mengangkat tangan.
  const eskalasi = jawaban.toolCalls.find((t) => t.name === 'escalate_concern');
  if (eskalasi) {
    const severity = severityDari(eskalasi.arguments['severity']);
    await balas(userId, concernReply(severity));
    return { kind: 'concern', severity };
  }

  // Model menyimpulkan ini laporan makan, bukan pertanyaan. Yang dipakai hanya
  // label makanannya; kalorinya tetap dari database (AD-1).
  const logFood = jawaban.toolCalls.find((t) => t.name === 'log_food');
  if (logFood) {
    const labels = labelDariToolCall(logFood.arguments);
    if (labels.length > 0) {
      return catatMakanan(sesi, labels.join(', '), { bolehTanyaCoach: false });
    }
  }

  // Balasan kosong bukan balasan. Ini bisa terjadi pada model penalar yang
  // kehabisan token di tengah monolognya: setelah blok `<think>` dibuang,
  // yang tersisa nol karakter. Tanpa penjagaan ini, pengguna menerima pesan
  // kosong — dan verifikasi angka meloloskannya, karena teks tanpa angka
  // memang tidak punya klaim untuk dicocokkan.
  if (jawaban.text.trim().length === 0) {
    console.warn('[message.received] coach balas kosong', hashWaId(job.waId));
    await balas(userId, catatanMedis + renderDeterministicTemplate(ctx));
    return { kind: 'answered', fallback: true };
  }

  const verifikasi = verifyCoachNumbers(jawaban.text, truthFromContext(ctx));
  if (!verifikasi.ok) {
    // §6.4: fallback ke template deterministik, bukan retry. Mengulang ke model
    // yang sama untuk masalah yang sama hanya membakar token.
    console.warn(
      '[message.received] coach.number_mismatch',
      hashWaId(job.waId),
      verifikasi.offending.map((o) => o.source),
    );
    await balas(userId, catatanMedis + renderDeterministicTemplate(ctx));
    return { kind: 'answered', fallback: true };
  }

  await balas(userId, catatanMedis + jawaban.text);
  return { kind: 'answered', fallback: false };
}

/**
 * Severity dari model tidak dipercaya begitu saja. Nilai yang tidak dikenali
 * dinaikkan ke tingkat yang lebih menahan, bukan diturunkan — kalau model
 * merasa perlu mengeskalasi, keraguan berpihak pada berhenti memberi angka.
 */
function severityDari(raw: unknown): ConcernSeverity {
  return raw === 'medical' || raw === 'crisis' || raw === 'eating_disorder'
    ? raw
    : 'eating_disorder';
}

function labelDariToolCall(args: Record<string, unknown>): string[] {
  const items = args['items'];
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      if (typeof it !== 'object' || it === null) return '';
      const rec = it as Record<string, unknown>;
      const label = typeof rec['raw_label'] === 'string' ? rec['raw_label'] : '';
      const qty = typeof rec['quantity_text'] === 'string' ? rec['quantity_text'] : '';
      return `${qty} ${label}`.trim();
    })
    .filter((s) => s.length > 0);
}

/** Nama job, dipakai worker dan simulator saat menandai hasil di log. */
export const MESSAGE_RECEIVED = 'message.received' as const;
