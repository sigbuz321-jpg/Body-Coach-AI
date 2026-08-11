import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tes kontrak untuk POST /api/onboarding.
 *
 * `@bodycoach/db` diganti dengan penyimpanan in-memory supaya route-nya bisa
 * diuji tanpa Postgres. Engine (`@bodycoach/core`) TIDAK dimock — angka yang
 * diperiksa di sini adalah angka yang benar-benar dihitung engine.
 */

const store = vi.hoisted(() => ({
  userSeq: 0,
  users: [] as { id: string }[],
  profiles: [] as Record<string, unknown>[],
  targets: [] as Record<string, unknown>[],
  tokens: [] as { token: string; userId: string }[],
  idem: new Map<string, unknown>(),
  failCreateUser: false,
  reset() {
    this.userSeq = 0;
    this.users = [];
    this.profiles = [];
    this.targets = [];
    this.tokens = [];
    this.idem = new Map();
    this.failCreateUser = false;
  },
}));

vi.mock('@bodycoach/db', () => ({
  withTransaction: async <T>(fn: (client: unknown) => Promise<T>): Promise<T> => {
    // Meniru rollback: kegagalan di tengah membatalkan klaim idempotensi juga.
    const snapshot = new Map(store.idem);
    try {
      return await fn({});
    } catch (err) {
      store.idem = snapshot;
      throw err;
    }
  },
  createUser: async () => {
    if (store.failCreateUser) throw new Error('relation "users" does not exist');
    store.userSeq += 1;
    const user = { id: `user-${store.userSeq}` };
    store.users.push(user);
    return user;
  },
  upsertProfile: async (_c: unknown, p: Record<string, unknown>) => {
    store.profiles.push(p);
  },
  appendTargetVersion: async (_c: unknown, t: Record<string, unknown>) => {
    store.targets.push(t);
    return { id: `target-${store.targets.length}` };
  },
  createUniqueLinkToken: async (_c: unknown, input: { userId: string; generate: () => string }) => {
    const token = input.generate();
    store.tokens.push({ token, userId: input.userId });
    return { token, user_id: input.userId, expires_at: new Date(), used_at: null };
  },
  claimIdempotencyKey: async (_c: unknown, endpoint: string, key: string) => {
    const composite = `${endpoint}|${key}`;
    if (store.idem.has(composite)) return false;
    store.idem.set(composite, null);
    return true;
  },
  storeIdempotencyResponse: async (
    _c: unknown,
    endpoint: string,
    key: string,
    response: unknown,
  ) => {
    store.idem.set(`${endpoint}|${key}`, response);
  },
  findIdempotencyResponse: async (_c: unknown, endpoint: string, key: string) =>
    store.idem.get(`${endpoint}|${key}`) ?? null,
}));

const { POST } = await import('./route');

interface BlockedBody {
  kind: 'blocked';
  reason: string;
}
interface ReadyBody {
  kind: 'ready';
  plan: {
    goal: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    weeklyKg: number;
    timeline: { minWeeks: number; maxWeeks: number } | null;
  };
  linkToken: string;
}
interface ErrorBody {
  error: string;
}

const VALID = {
  goal: 'bulk',
  sex: 'male',
  birthYear: 2000,
  heightCm: 175,
  weightKg: 70,
  targetWeightKg: 78,
  activity: 'moderate',
  gymPerWeek: 4,
  preferences: ['halal'],
  budgetPerMealIdr: 22_500,
  displayName: null,
  consentHealthData: true,
} as const;

function post(body: unknown, key: string | null = 'key-onboarding-0001'): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key !== null) headers['Idempotency-Key'] = key;
  return POST(
    new Request('http://localhost/api/onboarding', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  store.reset();
});

describe('validasi boundary', () => {
  it('menolak request tanpa Idempotency-Key', async () => {
    const res = await post(VALID, null);
    expect(res.status).toBe(400);
    expect(store.users).toHaveLength(0);
  });

  it('menolak Idempotency-Key yang terlalu pendek', async () => {
    const res = await post(VALID, 'pendek');
    expect(res.status).toBe(400);
  });

  it('menolak payload tanpa consent data kesehatan', async () => {
    const { consentHealthData: _omitted, ...tanpaConsent } = VALID;
    const res = await post(tanpaConsent);
    expect(res.status).toBe(400);
    expect(store.users).toHaveLength(0);
    expect(store.profiles).toHaveLength(0);
  });

  it('menolak consent bernilai false', async () => {
    const res = await post({ ...VALID, consentHealthData: false });
    expect(res.status).toBe(400);
    expect(store.profiles).toHaveLength(0);
  });
});

describe('guardrail', () => {
  it('profil terblokir tidak menulis apa pun dan tidak memakai kunci idempotensi', async () => {
    const res = await post({
      ...VALID,
      sex: 'female',
      goal: 'cut',
      heightCm: 170,
      weightKg: 48,
      targetWeightKg: 45,
    });
    const body = (await res.json()) as BlockedBody;

    expect(res.status).toBe(200);
    expect(body.kind).toBe('blocked');
    expect(store.users).toHaveLength(0);
    expect(store.targets).toHaveLength(0);
    expect(store.idem.size).toBe(0);
  });

  it('respons blocked tidak memuat satu digit pun', async () => {
    const res = await post({
      ...VALID,
      sex: 'female',
      goal: 'cut',
      heightCm: 170,
      weightKg: 48,
      targetWeightKg: 45,
    });
    const body = (await res.json()) as BlockedBody;
    expect(JSON.stringify(body)).not.toMatch(/\d/);
  });
});

describe('jalur sukses', () => {
  it('token yang dikembalikan adalah token yang tersimpan di database', async () => {
    // Regresi: versi sebelumnya membuat token B, menyimpannya, lalu
    // mengembalikan token A yang tidak pernah di-INSERT — pairing WhatsApp
    // mustahil berhasil.
    const res = await post(VALID);
    const body = (await res.json()) as ReadyBody;

    expect(res.status).toBe(200);
    expect(store.tokens).toHaveLength(1);
    expect(body.linkToken).toBe(store.tokens[0]?.token);
    expect(body.linkToken).toMatch(/^MULAI-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('menulis profile dan target v1 untuk user yang sama', async () => {
    await post(VALID);
    expect(store.users).toHaveLength(1);
    expect(store.profiles).toHaveLength(1);
    expect(store.targets).toHaveLength(1);
    expect(store.profiles[0]?.['userId']).toBe(store.users[0]?.id);
    expect(store.targets[0]?.['userId']).toBe(store.users[0]?.id);
    expect(store.targets[0]?.['reason']).toBe('onboarding');
    expect(store.tokens[0]?.userId).toBe(store.users[0]?.id);
  });

  it('menyimpan consent_health_data_at', async () => {
    await post(VALID);
    expect(store.profiles[0]?.['consentHealthDataAt']).toBeInstanceOf(Date);
  });

  it('angka rencana sama dengan hasil engine', async () => {
    const { computeTargets, estimateTimeline } = await import('@bodycoach/core');
    const profile = {
      sex: 'male',
      birthYear: VALID.birthYear,
      heightCm: VALID.heightCm,
      weightKg: VALID.weightKg,
      targetWeightKg: VALID.targetWeightKg,
      goal: 'bulk',
      activity: 'moderate',
      gymPerWeek: VALID.gymPerWeek,
      conservativeMode: false,
      medicalFlags: [],
    } as const;
    const expected = computeTargets(profile, new Date().getFullYear());
    const expectedTimeline = estimateTimeline(profile, expected.weeklyKg);

    const res = await post(VALID);
    const body = (await res.json()) as ReadyBody;

    expect(body.plan.kcal).toBe(expected.kcal);
    expect(body.plan.proteinG).toBe(expected.proteinG);
    expect(body.plan.carbsG).toBe(expected.carbsG);
    expect(body.plan.fatG).toBe(expected.fatG);
    expect(body.plan.timeline).toEqual(
      expectedTimeline === null
        ? null
        : { minWeeks: expectedTimeline.minWeeks, maxWeeks: expectedTimeline.maxWeeks },
    );
  });

  it('maintain mengembalikan timeline null, bukan nol minggu', async () => {
    const res = await post({ ...VALID, goal: 'maintain', targetWeightKg: VALID.weightKg });
    const body = (await res.json()) as ReadyBody;
    expect(body.plan.timeline).toBeNull();
  });
});

describe('idempotensi', () => {
  it('request identik dua kali menghasilkan satu user dan respons yang sama', async () => {
    const first = (await (await post(VALID)).json()) as ReadyBody;
    const second = (await (await post(VALID)).json()) as ReadyBody;

    expect(second).toEqual(first);
    expect(store.users).toHaveLength(1);
    expect(store.targets).toHaveLength(1);
    expect(store.tokens).toHaveLength(1);
  });

  it('kunci berbeda menghasilkan user baru', async () => {
    await post(VALID, 'key-onboarding-0001');
    await post(VALID, 'key-onboarding-0002');
    expect(store.users).toHaveLength(2);
  });
});

describe('kegagalan database', () => {
  it('mengembalikan 500 dengan pesan yang ramah, bukan pesan Postgres mentah', async () => {
    store.failCreateUser = true;
    const res = await post(VALID);
    const body = (await res.json()) as ErrorBody;

    expect(res.status).toBe(500);
    expect(body.error).not.toMatch(/relation|does not exist/i);
    expect(body.error).toMatch(/coba/i);
  });

  it('kunci idempotensi dilepas kembali sehingga retry bisa berhasil', async () => {
    store.failCreateUser = true;
    expect((await post(VALID)).status).toBe(500);

    store.failCreateUser = false;
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(store.users).toHaveLength(1);
  });
});
