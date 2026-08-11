import {
  appendTargetVersion,
  claimIdempotencyKey,
  createUniqueLinkToken,
  createUser,
  findIdempotencyResponse,
  storeIdempotencyResponse,
  upsertProfile,
  withTransaction,
} from '@bodycoach/db';
import {
  computeTargets,
  estimateTimeline,
  evaluateProfile,
  type ActivityLevel,
  type Goal,
  type Profile,
  type Sex,
} from '@bodycoach/core';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';

import type { FoodPreference, OnboardingSubmitPayload } from '../../../lib/onboarding';

/**
 * Endpoint POST /api/onboarding.
 *
 * Alur:
 * 1. Validasi body dengan Zod (boundary parsing).
 * 2. Bentuk domain `Profile` dari payload.
 * 3. Panggil `evaluateProfile` (engine) SEBELUM menyentuh database. Varian
 *    `blocked` tidak menulis apa pun dan mengembalikan `{ kind: 'blocked',
 *    reason }` — klien menampilkan layar guardrail tanpa angka.
 * 4. Varian `ready`: klaim Idempotency-Key → buat `user` → upsert `profiles` →
 *    append `target_versions` v1 dengan `effective_from = hari ini di
 *    Asia/Jakarta` → buat `link_tokens` → simpan respons ke kunci idempotensi.
 *    Semuanya dalam satu transaksi.
 *
 * Semua angka gizi berasal dari engine (`computeTargets`, `estimateTimeline`),
 * tidak ada yang dihitung ulang di klien.
 */

const ENDPOINT = 'POST /api/onboarding';

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
  // Consent data kesehatan wajib eksplisit. `literal(true)` berarti request
  // tanpa centang ditolak di boundary — server tidak pernah menyimpulkan
  // consent dari fakta bahwa request-nya terkirim.
  consentHealthData: z.literal(true),
});

/** Bentuk respons sukses. Disimpan apa adanya ke kunci idempotensi. */
interface ReadyResponse {
  readonly kind: 'ready';
  readonly plan: {
    readonly goal: Goal;
    readonly currentWeightKg: number;
    readonly targetWeightKg: number;
    readonly kcal: number;
    readonly proteinG: number;
    readonly carbsG: number;
    readonly fatG: number;
    readonly weeklyKg: number;
    readonly timeline: { readonly minWeeks: number; readonly maxWeeks: number } | null;
    readonly engineVersion: string;
  };
  readonly linkToken: string;
}

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
  // 6 karakter base32 tanpa karakter ambigu (0/O, 1/I) — gampang diketik
  // manual saat pairing M5. `randomInt` menghindari modulo bias yang membuat
  // huruf awal alfabet lebih sering muncul.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'MULAI-';
  for (let i = 0; i < 6; i++) {
    out += alphabet[randomInt(alphabet.length)];
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
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: 'Idempotency-Key wajib diisi (8–200 karakter).' },
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
  const profile = toProfile(payload);

  // Jalankan engine lebih dulu: tidak ada angka yang boleh ditulis — dan tidak
  // ada kunci idempotensi yang boleh terpakai — sebelum guardrail memastikan
  // profil aman. Jalur ini sama sekali tidak menyentuh database.
  const plan = evaluateProfile(profile);
  if (plan.kind === 'blocked') {
    // PENTING: tidak ada field numerik di respons ini. Klien tidak punya
    // tempat untuk menampilkannya. (AD-1: angka dari engine saja.)
    return NextResponse.json({ kind: 'blocked', reason: plan.guardrail.reason }, { status: 200 });
  }

  // Hitung target di server. `currentYear` dipakai eksplisit (lihat core).
  const conservativeProfile: Profile = { ...profile, conservativeMode: plan.conservative };
  const targets = computeTargets(conservativeProfile, new Date().getFullYear());
  // Perkiraan durasi juga dari engine — `null` untuk maintain / laju nol,
  // supaya layar rencana tidak pernah menampilkan "0 minggu".
  const timeline = estimateTimeline(conservativeProfile, targets.weeklyKg);

  const effectiveFrom = todayInJakarta();

  try {
    const outcome = await withTransaction(async (client) => {
      // Klaim di awal transaksi. Request duplikat yang datang bersamaan
      // menunggu di row lock ini, lalu membaca respons yang sudah commit.
      const claimed = await claimIdempotencyKey(client, ENDPOINT, idempotencyKey);
      if (!claimed) {
        const stored = await findIdempotencyResponse<ReadyResponse>(
          client,
          ENDPOINT,
          idempotencyKey,
        );
        return { replayed: stored, body: null };
      }

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
      await appendTargetVersion(client, {
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
      // Token yang dikembalikan ke klien HARUS token yang tersimpan di DB —
      // dibaca dari baris hasil INSERT, bukan dari variabel terpisah.
      const linkToken = await createUniqueLinkToken(client, {
        userId: user.id,
        generate: newLinkToken,
      });

      const body: ReadyResponse = {
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
          timeline:
            timeline === null ? null : { minWeeks: timeline.minWeeks, maxWeeks: timeline.maxWeeks },
          engineVersion: targets.engineVersion,
        },
        linkToken: linkToken.token,
      };
      await storeIdempotencyResponse(client, ENDPOINT, idempotencyKey, body);
      return { replayed: null, body };
    });

    if (outcome.replayed !== null) {
      return NextResponse.json(outcome.replayed, { status: 200 });
    }
    if (!outcome.body) {
      // Kunci sudah diklaim tapi responsnya kosong. Tidak mungkin terjadi
      // lewat jalur di atas (klaim dan respons commit bersama), tapi kalau
      // sampai terjadi, jangan diam-diam mengulang mutasinya.
      return NextResponse.json(
        { error: 'Permintaan dengan kunci yang sama sedang diproses. Coba lagi sebentar.' },
        { status: 409 },
      );
    }
    return NextResponse.json(outcome.body, { status: 200 });
  } catch (err) {
    // Detail teknis hanya ke log server. Yang sampai ke pengguna adalah
    // kalimat yang menjelaskan dan memberi jalan keluar (aturan copy
    // CLAUDE.md), bukan pesan Postgres mentah.
    console.error('[onboarding] gagal menulis DB:', err);
    return NextResponse.json(
      { error: 'Rencana kamu belum tersimpan. Coba tekan tombolnya sekali lagi.' },
      { status: 500 },
    );
  }
}
