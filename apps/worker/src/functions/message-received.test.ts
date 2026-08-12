import type { CoachContext } from '@bodycoach/core';
import type { FoodResolution, MessageJob } from '@bodycoach/db';
import { describe, expect, it, vi } from 'vitest';

import {
  handleMessageReceived,
  type CoachAnswer,
  type MessageDeps,
  type Messenger,
  type PairOutcome,
  type Store,
} from './message-received';

/**
 * Test handler `message.received`.
 *
 * Semuanya berjalan tanpa Postgres, Redis, Meta, maupun MiniMax: yang diuji di
 * sini adalah keputusan, dan keputusan tidak boleh menuntut empat layanan
 * hidup sekaligus untuk bisa diperiksa.
 */

const WA_ID = '628123456789';

const CTX: CoachContext = {
  displayName: 'Daffa',
  goal: 'bulk',
  currentWeightKg: 63.4,
  targetWeightKg: 70,
  target: { goal: 'bulk', kcal: 2650, proteinG: 140, carbsG: 320, fatG: 75 },
  consumed: { kcal: 1830, proteinG: 98, carbsG: 210, fatG: 58 },
  hourWib: 19,
  foodPrefs: ['halal'],
  budgetPerMealIdr: 30_000,
  weightTrend: null,
  adherenceDays: 5,
};

function resolved(over: {
  rawLabel: string;
  nameId: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
  confidence?: number;
}): FoodResolution {
  return {
    kind: 'resolved',
    item: {
      rawLabel: over.rawLabel,
      foodItemId: `id-${over.nameId}`,
      nameId: over.nameId,
      grams: over.grams,
      portionBasis: 'default',
      portionLabel: '1 porsi',
      matchStage: 'alias',
      confidence: over.confidence ?? 1,
      nutrition: {
        kcal: over.kcal,
        proteinG: over.proteinG,
        carbsG: over.carbsG ?? 0,
        fatG: over.fatG ?? 0,
      },
    },
  };
}

function unresolved(rawLabel: string): FoodResolution {
  return { kind: 'unresolved', item: { rawLabel, query: rawLabel, candidates: [] } };
}

const NASI = resolved({
  rawLabel: 'nasi',
  nameId: 'Nasi putih',
  grams: 150,
  kcal: 195,
  proteinG: 4,
  carbsG: 42,
});
const GEPREK = resolved({
  rawLabel: 'ayam geprek',
  nameId: 'Ayam geprek',
  grams: 120,
  kcal: 342,
  proteinG: 25,
  carbsG: 14,
  fatG: 22,
});

interface Rekaman {
  readonly outbound: { kind: 'text' | 'interactive'; body: string; buttons?: string[] }[];
  readonly logsDibuat: string[];
  readonly statusDiubah: { logId: string; status: string }[];
  readonly beratDisimpan: number[];
  readonly pesanTercatat: { direction: string; body?: string }[];
}

function harness(
  over: {
    userId?: string | null;
    ctx?: CoachContext | null;
    resolve?: readonly FoodResolution[];
    pair?: PairOutcome;
    createLog?: () => string | null;
    setStatus?: boolean;
    coach?: CoachAnswer | Error | null;
    lockTersedia?: boolean;
    latestWeight?: number | null;
  } = {},
): { deps: MessageDeps; rekam: Rekaman; requeued: MessageJob[]; released: number[] } {
  const rekam: Rekaman = {
    outbound: [],
    logsDibuat: [],
    statusDiubah: [],
    beratDisimpan: [],
    pesanTercatat: [],
  };
  const requeued: MessageJob[] = [];
  const released: number[] = [];

  const messenger: Messenger = {
    async sendText(_to, body) {
      rekam.outbound.push({ kind: 'text', body });
      return { messageId: `out-${rekam.outbound.length}` };
    },
    async sendInteractive(msg) {
      rekam.outbound.push({
        kind: 'interactive',
        body: msg.body,
        buttons: msg.buttons.map((b) => b.title),
      });
      return { messageId: `out-${rekam.outbound.length}` };
    },
  };

  let logCounter = 0;
  const store: Store = {
    async findUserIdByWaId() {
      return over.userId === undefined ? 'user-1' : over.userId;
    },
    async pairToken() {
      return over.pair ?? { kind: 'not_found' };
    },
    async loadContext() {
      return over.ctx === undefined ? CTX : over.ctx;
    },
    async resolveFood() {
      return over.resolve ?? [unresolved('halo')];
    },
    async createPendingLog() {
      const id = over.createLog ? over.createLog() : `log-${++logCounter}`;
      if (id) rekam.logsDibuat.push(id);
      return id;
    },
    async setLogStatus(input) {
      rekam.statusDiubah.push({ logId: input.logId, status: input.status });
      return over.setStatus ?? true;
    },
    async recordMessage(input) {
      rekam.pesanTercatat.push({
        direction: input.direction,
        ...(input.body ? { body: input.body } : {}),
      });
    },
    async latestWeightKg() {
      return over.latestWeight ?? null;
    },
    async saveWeight(_userId, _localDate, kg) {
      rekam.beratDisimpan.push(kg);
    },
  };

  const coachAnswer = over.coach;
  const deps: MessageDeps = {
    store,
    messenger,
    coach:
      coachAnswer === undefined || coachAnswer === null
        ? null
        : {
            async ask() {
              if (coachAnswer instanceof Error) throw coachAnswer;
              return coachAnswer;
            },
          },
    lock: {
      async acquire() {
        if (over.lockTersedia === false) return null;
        return {
          release: async () => {
            released.push(Date.now());
          },
        };
      },
    },
    async requeue(job) {
      requeued.push(job);
    },
    now: () => new Date('2026-08-12T12:15:00Z'), // 19:15 WIB
    appUrl: 'https://contoh.id',
  };

  return { deps, rekam, requeued, released };
}

function job(over: Partial<MessageJob> = {}): MessageJob {
  return {
    waId: WA_ID,
    messageId: 'wamid.1',
    type: 'text',
    body: 'tadi gue makan nasi sama ayam geprek',
    ts: 1_770_000_000,
    ...over,
  };
}

/** Semua angka yang bisa dibaca sebagai klaim gizi atau berat. */
function memuatAngka(teks: string): boolean {
  return /\d/.test(teks);
}

describe('kunci per pengguna', () => {
  it('menunda job dan mengembalikannya ke antrean saat kunci dipegang', async () => {
    const { deps, rekam, requeued } = harness({ lockTersedia: false });

    const hasil = await handleMessageReceived(deps, job());

    expect(hasil).toEqual({ kind: 'deferred' });
    expect(requeued).toHaveLength(1);
    // Tidak ada balasan: pesannya belum diproses, cuma ditunda.
    expect(rekam.outbound).toHaveLength(0);
  });

  it('melepas kunci walau pemrosesan melempar', async () => {
    const { deps, released } = harness();
    deps.store.loadContext = vi.fn().mockRejectedValue(new Error('db mati'));

    await expect(handleMessageReceived(deps, job())).rejects.toThrow('db mati');
    expect(released).toHaveLength(1);
  });

  it('memproses tiga pesan berurutan tanpa saling menimpa', async () => {
    const { deps, rekam } = harness({ resolve: [NASI] });

    for (const id of ['wamid.a', 'wamid.b', 'wamid.c']) {
      await handleMessageReceived(deps, job({ messageId: id }));
    }

    expect(rekam.logsDibuat).toEqual(['log-1', 'log-2', 'log-3']);
    expect(rekam.outbound).toHaveLength(3);
  });
});

describe('pairing', () => {
  it('menautkan nomor lalu menyapa dengan target', async () => {
    const { deps, rekam } = harness({
      userId: null,
      pair: { kind: 'paired', userId: 'user-9' },
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'MULAI-7VFXVC' }));

    expect(hasil).toEqual({ kind: 'paired', userId: 'user-9' });
    expect(rekam.outbound[0]?.body).toContain('Halo Daffa!');
    expect(rekam.outbound[0]?.body).toContain('2.650 kkal');
  });

  it('tidak peduli huruf besar-kecil dan spasi', async () => {
    const { deps } = harness({ userId: null, pair: { kind: 'paired', userId: 'user-9' } });
    const hasil = await handleMessageReceived(deps, job({ body: '  mulai-7vfxvc  ' }));
    expect(hasil.kind).toBe('paired');
  });

  it('tidak menyebut angka apa pun kalau onboarding belum tuntas', async () => {
    const { deps, rekam } = harness({
      userId: null,
      ctx: null,
      pair: { kind: 'paired', userId: 'user-9' },
    });

    await handleMessageReceived(deps, job({ body: 'MULAI-7VFXVC' }));
    expect(memuatAngka(rekam.outbound[0]?.body ?? '')).toBe(false);
  });

  it('menjelaskan tiap sebab kegagalan tanpa menautkan apa pun', async () => {
    for (const kind of ['not_found', 'expired', 'already_used', 'wa_taken'] as const) {
      const { deps, rekam } = harness({ userId: null, pair: { kind } });
      const hasil = await handleMessageReceived(deps, job({ body: 'MULAI-ZZZZZZ' }));

      expect(hasil).toEqual({ kind: 'pair_failed', reason: kind });
      expect(rekam.outbound).toHaveLength(1);
    }
  });
});

describe('nomor belum tertaut', () => {
  it('mengarahkan ke web tanpa membocorkan angka siapa pun', async () => {
    const { deps, rekam } = harness({ userId: null });

    const hasil = await handleMessageReceived(deps, job({ body: 'nasi padang' }));

    expect(hasil).toEqual({ kind: 'not_linked' });
    expect(rekam.outbound[0]?.body).toContain('https://contoh.id');
    expect(rekam.outbound[0]?.body).not.toMatch(/kkal|kalori/i);
    // Tidak ada yang dicatat: kita belum tahu ini nomor milik siapa.
    expect(rekam.pesanTercatat).toHaveLength(0);
  });
});

describe('pencatatan makanan lewat teks', () => {
  it('memecah satu kalimat jadi dua item dengan makro dari database', async () => {
    const { deps, rekam } = harness({ resolve: [NASI, GEPREK] });

    const hasil = await handleMessageReceived(deps, job());

    expect(hasil).toEqual({ kind: 'logged', logId: 'log-1', items: 2 });
    const balasan = rekam.outbound[0];
    expect(balasan?.body).toContain('Nasi putih 150 g — ±195 kkal · P4 K42 L0');
    expect(balasan?.body).toContain('Ayam geprek 120 g — ±342 kkal · P25 K14 L22');
  });

  it('menyertakan sisa target dan tiga tombol', async () => {
    const { deps, rekam } = harness({ resolve: [NASI, GEPREK] });

    await handleMessageReceived(deps, job());

    const balasan = rekam.outbound[0];
    expect(balasan?.kind).toBe('interactive');
    expect(balasan?.body).toContain('Kalau dicatat, sisa ±283 kkal');
    expect(balasan?.buttons).toEqual(['Catat', 'Ubah porsi', 'Batal']);
  });

  it('angkanya persis hasil engine, bukan pembulatan sendiri', async () => {
    const { deps, rekam } = harness({ resolve: [NASI, GEPREK] });
    await handleMessageReceived(deps, job());

    // 2650 − (1830 + 195 + 342) = 283. 140 − (98 + 4 + 25) = 13.
    expect(rekam.outbound[0]?.body).toContain('±283 kkal');
    expect(rekam.outbound[0]?.body).toContain('protein kurang 13g');
  });

  it('replay pesan yang sama tidak menghasilkan log kedua maupun balasan kedua', async () => {
    let pertama = true;
    const { deps, rekam } = harness({
      resolve: [NASI],
      createLog: () => {
        if (!pertama) return null; // unique constraint source_message_id
        pertama = false;
        return 'log-1';
      },
    });

    const a = await handleMessageReceived(deps, job({ messageId: 'wamid.sama' }));
    const b = await handleMessageReceived(deps, job({ messageId: 'wamid.sama' }));
    const c = await handleMessageReceived(deps, job({ messageId: 'wamid.sama' }));

    expect(a.kind).toBe('logged');
    expect(b).toEqual({ kind: 'duplicate' });
    expect(c).toEqual({ kind: 'duplicate' });
    expect(rekam.logsDibuat).toEqual(['log-1']);
    expect(rekam.outbound).toHaveLength(1);
  });

  it('menyebut yang tidak ketemu tanpa membatalkan yang ketemu', async () => {
    const { deps, rekam } = harness({ resolve: [NASI, unresolved('salad buah naga')] });

    const hasil = await handleMessageReceived(deps, job());

    expect(hasil.kind).toBe('logged');
    expect(rekam.outbound[0]?.body).toContain('"salad buah naga"');
  });

  it('tidak mencatat apa-apa kalau tidak satu pun dikenali', async () => {
    const { deps, rekam } = harness({ resolve: [unresolved('zzz')] });

    const hasil = await handleMessageReceived(deps, job({ body: 'zzz' }));

    expect(hasil).toEqual({ kind: 'no_food' });
    expect(rekam.logsDibuat).toHaveLength(0);
  });

  it('tidak mencatat kalimat yang sebenarnya pertanyaan', async () => {
    // Tanpa penjaga ini, "ayam geprek" di dalam pertanyaan tercatat 342 kkal
    // yang tidak pernah dimakan siapa pun.
    const { deps, rekam } = harness({ resolve: [GEPREK] });

    const hasil = await handleMessageReceived(
      deps,
      job({ body: 'enaknya makan ayam geprek gak ya?' }),
    );

    expect(hasil.kind).toBe('answered');
    expect(rekam.logsDibuat).toHaveLength(0);
  });
});

describe('tombol interaktif', () => {
  it('Catat memindahkan log ke confirmed lalu melaporkan sisa terbaru', async () => {
    const { deps, rekam } = harness();

    const hasil = await handleMessageReceived(
      deps,
      job({ type: 'interactive', body: '', buttonId: 'log:confirm:log-1' }),
    );

    expect(hasil).toEqual({ kind: 'log_confirmed' });
    expect(rekam.statusDiubah).toEqual([{ logId: 'log-1', status: 'confirmed' }]);
    expect(rekam.outbound[0]?.body).toMatch(/^Tercatat\./);
  });

  it('Batal membuang log tanpa memasukkannya ke hitungan', async () => {
    const { deps, rekam } = harness();

    const hasil = await handleMessageReceived(
      deps,
      job({ type: 'interactive', body: '', buttonId: 'log:cancel:log-1' }),
    );

    expect(hasil).toEqual({ kind: 'log_cancelled' });
    expect(rekam.statusDiubah).toEqual([{ logId: 'log-1', status: 'discarded' }]);
  });

  it('Ubah porsi membuang log lama dan meminta porsinya', async () => {
    const { deps, rekam } = harness();

    const hasil = await handleMessageReceived(
      deps,
      job({ type: 'interactive', body: '', buttonId: 'log:portion:log-1' }),
    );

    expect(hasil).toEqual({ kind: 'log_portion' });
    expect(rekam.statusDiubah[0]?.status).toBe('discarded');
    expect(rekam.outbound[0]?.body).toContain('setengah porsi');
  });

  it('tombol yang lognya sudah diproses tidak mengubah status apa pun', async () => {
    const { deps, rekam } = harness({ setStatus: false });

    const hasil = await handleMessageReceived(
      deps,
      job({ type: 'interactive', body: '', buttonId: 'log:confirm:log-1' }),
    );

    expect(hasil).toEqual({ kind: 'log_stale' });
    expect(rekam.outbound[0]?.body).toContain('udah diproses');
  });

  it('id tombol asing ditolak, bukan ditebak', async () => {
    const { deps } = harness();
    const hasil = await handleMessageReceived(
      deps,
      job({ type: 'interactive', body: '', buttonId: 'apa-ini' }),
    );
    expect(hasil).toEqual({ kind: 'ignored', reason: 'tombol_tidak_dikenal' });
  });
});

describe('guardrail keselamatan', () => {
  it('gangguan makan menghentikan angka sepenuhnya', async () => {
    const { deps, rekam } = harness({ resolve: [NASI] });

    const hasil = await handleMessageReceived(
      deps,
      job({ body: 'gue muntahin lagi abis makan tadi' }),
    );

    expect(hasil).toEqual({ kind: 'concern', severity: 'eating_disorder' });
    expect(memuatAngka(rekam.outbound[0]?.body ?? '')).toBe(false);
    expect(rekam.logsDibuat).toHaveLength(0);
  });

  it('krisis didahulukan dan tidak pernah menyentuh food resolver', async () => {
    const resolveFood = vi.fn();
    const { deps } = harness();
    deps.store.resolveFood = resolveFood;

    const hasil = await handleMessageReceived(deps, job({ body: 'gue pengen mati aja' }));

    expect(hasil).toEqual({ kind: 'concern', severity: 'crisis' });
    expect(resolveFood).not.toHaveBeenCalled();
  });

  it('kasus medis tidak menghentikan coaching tapi arahannya mendahului balasan', async () => {
    const { deps, rekam } = harness({ resolve: [NASI] });

    const hasil = await handleMessageReceived(deps, job({ body: 'gue diabetes, tadi makan nasi' }));

    expect(hasil.kind).toBe('logged');
    expect(rekam.outbound[0]?.body).toMatch(/^Karena kondisi yang kamu sebut/);
    expect(rekam.outbound[0]?.body).toContain('Nasi putih');
  });

  it('menghentikan angka saat model sendiri memanggil escalate_concern', async () => {
    const { deps, rekam } = harness({
      resolve: [unresolved('x')],
      coach: {
        text: 'ini seharusnya tidak terkirim: 2.650 kkal',
        toolCalls: [{ name: 'escalate_concern', arguments: { severity: 'crisis', reason: 'x' } }],
      },
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'gimana ya' }));

    expect(hasil).toEqual({ kind: 'concern', severity: 'crisis' });
    expect(memuatAngka(rekam.outbound[0]?.body ?? '')).toBe(false);
  });

  it('severity tak dikenal dinaikkan, bukan diturunkan', async () => {
    const { deps } = harness({
      resolve: [unresolved('x')],
      coach: {
        text: '',
        toolCalls: [{ name: 'escalate_concern', arguments: { severity: 'ringan' } }],
      },
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'gimana ya' }));

    expect(hasil).toEqual({ kind: 'concern', severity: 'eating_disorder' });
  });
});

describe('update berat', () => {
  it('menyimpan berat dan tidak meneruskannya ke food resolver', async () => {
    const resolveFood = vi.fn();
    const { deps, rekam } = harness({ latestWeight: 70 });
    deps.store.resolveFood = resolveFood;

    const hasil = await handleMessageReceived(deps, job({ body: 'berat gue 70,8 sekarang' }));

    expect(hasil).toEqual({ kind: 'weight_saved', kg: 70.8 });
    expect(rekam.beratDisimpan).toEqual([70.8]);
    expect(resolveFood).not.toHaveBeenCalled();
    expect(rekam.outbound[0]?.body).toContain('Naik 0,8 kg');
  });
});

describe('jalur coach', () => {
  it('meloloskan balasan yang angkanya cocok dengan engine', async () => {
    const { deps, rekam } = harness({
      resolve: [unresolved('x')],
      coach: {
        text: 'Sisa lo ±820 kkal. Ayam geprek sama nasi setengah porsi udah pas.',
        toolCalls: [],
      },
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'malam makan apa ya?' }));

    expect(hasil).toEqual({ kind: 'answered', fallback: false });
    expect(rekam.outbound[0]?.body).toContain('±820 kkal');
  });

  it('membuang balasan yang angkanya karangan dan memakai template engine', async () => {
    const { deps, rekam } = harness({
      resolve: [unresolved('x')],
      coach: { text: 'Sisa lo ±4.200 kkal, gaskeun.', toolCalls: [] },
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'malam makan apa ya?' }));

    expect(hasil).toEqual({ kind: 'answered', fallback: true });
    expect(rekam.outbound[0]?.body).not.toContain('4.200');
    expect(rekam.outbound[0]?.body).toContain('820'); // angka engine
  });

  it('tetap menjawab dengan angka engine saat provider mati', async () => {
    const { deps, rekam } = harness({
      resolve: [unresolved('x')],
      coach: new Error('MiniMax 429'),
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'malam makan apa ya?' }));

    expect(hasil).toEqual({ kind: 'answered', fallback: true });
    expect(rekam.outbound[0]?.body).toContain('820');
  });

  it('tetap menjawab saat AI_PROVIDER_KEY belum diisi', async () => {
    const { deps, rekam } = harness({ resolve: [unresolved('x')], coach: null });

    const hasil = await handleMessageReceived(deps, job({ body: 'malam makan apa ya?' }));

    expect(hasil).toEqual({ kind: 'answered', fallback: true });
    expect(rekam.outbound[0]?.body).toContain('820');
  });

  it('log_food dari model tetap lewat food database, bukan angka model', async () => {
    let panggilan = 0;
    const { deps, rekam } = harness({
      coach: {
        text: 'gue catat ya',
        toolCalls: [
          {
            name: 'log_food',
            arguments: { items: [{ raw_label: 'nasi', quantity_text: 'seporsi' }] },
          },
        ],
      },
    });
    deps.store.resolveFood = async () => (++panggilan === 1 ? [unresolved('x')] : [NASI]);

    const hasil = await handleMessageReceived(deps, job({ body: 'barusan gimana ya' }));

    expect(hasil.kind).toBe('logged');
    expect(rekam.outbound[0]?.body).toContain('±195 kkal');
  });

  it('tidak berputar kalau label dari model juga tidak dikenali', async () => {
    const { deps } = harness({
      resolve: [unresolved('x')],
      coach: {
        text: 'oke',
        toolCalls: [{ name: 'log_food', arguments: { items: [{ raw_label: 'zzz' }] } }],
      },
    });

    const hasil = await handleMessageReceived(deps, job({ body: 'zzz?' }));

    expect(hasil).toEqual({ kind: 'no_food' });
  });
});

describe('jenis pesan lain', () => {
  it('foto dijawab jujur, bukan didiamkan', async () => {
    const { deps, rekam } = harness();

    const hasil = await handleMessageReceived(
      deps,
      job({ type: 'image', body: '', mediaId: 'media-1' }),
    );

    expect(hasil).toEqual({ kind: 'ignored', reason: 'image_belum_didukung' });
    expect(rekam.outbound[0]?.body).toContain('ketik aja makanannya');
  });

  it('onboarding yang belum tuntas dijelaskan tanpa angka', async () => {
    const { deps, rekam } = harness({ ctx: null });

    const hasil = await handleMessageReceived(deps, job());

    expect(hasil).toEqual({ kind: 'onboarding_incomplete' });
    expect(rekam.outbound[0]?.body).toContain('https://contoh.id');
    expect(rekam.outbound[0]?.body).not.toMatch(/kkal/i);
  });

  it('pesan kosong tidak diteruskan ke resolver', async () => {
    const resolveFood = vi.fn();
    const { deps } = harness();
    deps.store.resolveFood = resolveFood;

    const hasil = await handleMessageReceived(deps, job({ body: '   ' }));

    expect(hasil).toEqual({ kind: 'ignored', reason: 'kosong' });
    expect(resolveFood).not.toHaveBeenCalled();
  });
});

describe('pencatatan percakapan', () => {
  it('mencatat pesan masuk dan keluar', async () => {
    const { deps, rekam } = harness({ resolve: [NASI] });

    await handleMessageReceived(deps, job());

    expect(rekam.pesanTercatat.map((m) => m.direction)).toEqual(['inbound', 'outbound']);
  });
});
