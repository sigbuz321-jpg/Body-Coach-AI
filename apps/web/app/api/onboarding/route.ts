import {
  appendTargetVersion,
  createUser,
  getPool,
  upsertProfile,
  withTransaction,
} from '@bodycoach/db';
import {
  computeTargets,
  evaluateProfile,
  type ActivityLevel,
  type Goal,
  type Profile,
  type Sex,
} from '@bodycoach/core';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import type { FoodPreference, OnboardingSubmitPayload } from '../../../lib/onboarding';

/**
 * Endpoint POST /api/onboarding.
 *
 * Alur:
 * 1. Validasi body dengan Zod (boundary parsing).
 * 2. Bentuk domain `Profile` dari payload.
 * 3. Panggil `evaluateProfile` (engine). Varian `blocked` tidak menulis apa pun
 *    ke DB dan mengembalikan `{ kind: 'blocked', reason }` — klien menampilkan
 *    layar guardrail tanpa angka.
 * 4. Varian `ready`: buat `user` (idempoten pada email bila ada) → upsert
 *    `profiles` → append `target_versions` v1 dengan `effective_from = hari ini
 *    di Asia/Jakarta` → buat `link_tokens` (MULAI-XXXX).
 * 5. Idempotency-Key dipakai agar replay dari klien yang retry tidak
 *    menggandakan user atau target.
 */

const PREFERENCES = ['halal', 'no_pork', 'no_seafood', 'vegetarian', 'no_dairy', 'none'] as const;

const PayloadSchema = z.object({
  goal: z.enum(['bulk', 'cut', 'maintain']),
  sex: z.enum(['male', 'female']),
  birthYear: z.number().int().min(1900).max(2100),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  targetWeightKg: z.number().min(30).max(300),
  activity: z.enum(['sedentary', 'light', 'moderate', 'high', 'very_high']),
  gymPerWeek: z.number().int().min(0).max(14),
  preferences: z.array(z.enum(PREFERENCES)).max(PREFERENCES.length),
  budgetPerMealIdr: z.number().int().min(0).max(1_000_000).nullable(),
  displayName: z.string().max(80).nullable(),
});

function todayInJakarta(): string {
  // ISO date Asia/Jakarta. `timeZone: 'Asia/Jakarta'` memastikan WIB dipakai,
  // bukan waktu UTC server.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function newLinkToken(): string {
  // 6 karakter base32 — gampang diketik manual saat pairing M5.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let out = 'MULAI-';
  for (let i = 0; i < 6; i++) {
    const byte = bytes[i] ?? 0;
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

function preferencesToFlags(prefs: readonly FoodPreference[]): string[] {
  return prefs.filter((p): p is Exclude<FoodPreference, 'none'> => p !== 'none');
}

function toProfile(p: OnboardingSubmitPayload): Profile {
  return {
    sex: p.sex as Sex,
    birthYear: p.birthYear,
    heightCm: p.heightCm,
    weightKg: p.weightKg,
    targetWeightKg: p.targetWeightKg,
    goal: p.goal as Goal,
    activity: p.activity as ActivityLevel,
    gymPerWeek: p.gymPerWeek,
    conservativeMode: false,
    medicalFlags: [],
  };
}

export async function POST(req: Request) {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return NextResponse.json(
      { error: 'Idempotency-Key wajib diisi (>= 8 karakter).' },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body bukan JSON valid.' }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Payload tidak valid.', detail: parsed.error.issues },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  // Jalankan engine lebih dulu: tidak ada angka yang boleh ditulis sebelum
  // guardrail memastikan profil aman.
  const plan = evaluateProfile(toProfile(payload));
  if (plan.kind === 'blocked') {
    // PENTING: tidak ada field numerik di respons ini. Klien tidak punya
    // tempat untuk menampilkannya. (AD: angka dari engine saja.)
    return NextResponse.json({ kind: 'blocked', reason: plan.guardrail.reason }, { status: 200 });
  }

  // Hitung target di server. `currentYear` dipakai eksplisit (lihat core).
  const targets = computeTargets(
    { ...toProfile(payload), conservativeMode: plan.conservative },
    new Date().getFullYear(),
  );

  const effectiveFrom = todayInJakarta();
  const linkToken = newLinkToken();

  try {
    const result = await withTransaction(async (client) => {
      const user = await createUser(client, { email: null });
      await upsertProfile(client, {
        userId: user.id,
        displayName: payload.displayName,
        sex: payload.sex,
        birthYear: payload.birthYear,
        heightCm: payload.heightCm,
        startWeightKg: payload.weightKg,
        targetWeightKg: payload.targetWeightKg,
        goal: payload.goal,
        activity: payload.activity,
        gymPerWeek: payload.gymPerWeek,
        foodPrefs: preferencesToFlags(payload.preferences),
        budgetPerMeal: payload.budgetPerMealIdr,
        medicalFlags: [],
        conservativeMode: plan.conservative,
        consentHealthDataAt: new Date(),
      });
      const target = await appendTargetVersion(client, {
        userId: user.id,
        effectiveFrom,
        goal: payload.goal,
        bmr: targets.bmr,
        tdee: targets.tdee,
        kcal: targets.kcal,
        proteinG: targets.proteinG,
        carbsG: targets.carbsG,
        fatG: targets.fatG,
        weeklyRateKg: targets.weeklyKg,
        reason: 'onboarding',
        engineVersion: targets.engineVersion,
      });
      // Token pair harus unik. `link_tokens.token` adalah PK, jadi duplikat
      // akan throw — kalau ini terjadi, ulangi sekali (sangat langka).
      const insertToken = async (): Promise<string> => {
        const candidate = newLinkToken();
        await client.query(
          `INSERT INTO link_tokens (token, user_id, expires_at)
           VALUES ($1, $2, now() + interval '24 hours')`,
          [candidate, user.id],
        );
        return candidate;
      };
      let token = linkToken;
      try {
        await insertToken();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!/duplicate key/i.test(msg) && !/unique constraint/i.test(msg)) throw err;
        token = await insertToken();
      }
      return { userId: user.id, targetId: target.id, token };
    });

    return NextResponse.json(
      {
        kind: 'ready',
        plan: {
          goal: payload.goal,
          currentWeightKg: payload.weightKg,
          targetWeightKg: payload.targetWeightKg,
          kcal: targets.kcal,
          proteinG: targets.proteinG,
          carbsG: targets.carbsG,
          fatG: targets.fatG,
          weeklyKg: targets.weeklyKg,
          engineVersion: targets.engineVersion,
        },
        linkToken: result.token,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[onboarding] gagal menulis DB:', err);
    // Tutup pool agar koneksi gagal tidak menggantung.
    await getPool()
      .end()
      .catch(() => undefined);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal membuat profil.' },
      { status: 500 },
    );
  }
}
