import { describe, expect, it } from 'vitest';

import { buildUserContextBlock, mealSlotForHour, remaining } from './context';
import { blocksNumbers, concernReply, detectConcern } from './concern';
import {
  extractClaims,
  renderDeterministicTemplate,
  truthFromContext,
  verifyCoachNumbers,
} from './numbers';
import type { CoachContext } from './types';

function ctx(over: Partial<CoachContext> = {}): CoachContext {
  return {
    displayName: 'Daffa',
    goal: 'bulk',
    currentWeightKg: 63.4,
    targetWeightKg: 70,
    target: { goal: 'bulk', kcal: 2650, proteinG: 140, carbsG: 320, fatG: 75 },
    consumed: { kcal: 1830, proteinG: 98, carbsG: 210, fatG: 58 },
    hourWib: 19,
    foodPrefs: ['halal'],
    budgetPerMealIdr: 30_000,
    weightTrend: { from: 63.1, to: 63.4 },
    adherenceDays: 5,
    ...over,
  };
}

describe('remaining', () => {
  it('menghitung sisa target', () => {
    expect(remaining(ctx())).toEqual({
      kcal: 820,
      proteinG: 42,
      carbsG: 110,
      fatG: 17,
      overKcal: false,
    });
  });

  it('menjepit di nol dan menandai kelebihan', () => {
    const r = remaining(ctx({ consumed: { kcal: 3000, proteinG: 200, carbsG: 400, fatG: 90 } }));
    expect(r.kcal).toBe(0);
    expect(r.proteinG).toBe(0);
    expect(r.overKcal).toBe(true);
  });
});

describe('mealSlotForHour', () => {
  it('memetakan jam WIB ke slot makan', () => {
    expect(mealSlotForHour(7)).toBe('sarapan');
    expect(mealSlotForHour(12)).toBe('makan_siang');
    expect(mealSlotForHour(19)).toBe('makan_malam');
    expect(mealSlotForHour(22)).toBe('snack');
  });
});

describe('buildUserContextBlock', () => {
  it('memakai format angka id-ID yang sama dengan web', () => {
    const blok = buildUserContextBlock(ctx());
    expect(blok).toContain('2.650 kkal');
    expect(blok).toContain('63,4 → 70,0 kg');
  });

  it('memuat semua baris yang diminta §6.1', () => {
    const blok = buildUserContextBlock(ctx());
    for (const kunci of [
      'Nama:',
      'Target hari ini:',
      'Sudah masuk:',
      'Waktu:',
      'Preferensi:',
      'Adherence',
    ]) {
      expect(blok).toContain(kunci);
    }
    expect(blok).toContain('sisa: 820 kkal · P42');
  });

  it('menyebut kelebihan alih-alih sisa saat lewat target', () => {
    const blok = buildUserContextBlock(
      ctx({ consumed: { kcal: 2950, proteinG: 150, carbsG: 350, fatG: 80 } }),
    );
    expect(blok).toContain('sudah lewat target 300 kkal');
    expect(blok).not.toContain('sisa:');
  });

  it('menyatakan data berat belum cukup, bukan mengarang tren', () => {
    expect(buildUserContextBlock(ctx({ weightTrend: null }))).toContain('belum cukup data');
  });

  it('deterministik — input sama menghasilkan blok yang identik', () => {
    expect(buildUserContextBlock(ctx())).toBe(buildUserContextBlock(ctx()));
  });
});

describe('extractClaims', () => {
  it('mengambil klaim kalori', () => {
    const c = extractClaims('Estimasi ±870 kkal ya');
    expect(c).toEqual([{ kind: 'kcal', value: 870, source: '±870 kkal' }]);
  });

  it('membaca pemisah ribuan id-ID', () => {
    expect(extractClaims('target 2.650 kkal')[0]?.value).toBe(2650);
  });

  it('mengambil makro dari kata yang mendahului angka', () => {
    const c = extractClaims('Protein lo masih kurang 42g');
    expect(c).toEqual([{ kind: 'protein', value: 42, source: expect.stringContaining('42') }]);
  });

  it('mengambil makro dari angka yang mendahului kata', () => {
    expect(extractClaims('38g protein')[0]).toMatchObject({ kind: 'protein', value: 38 });
  });

  it('mengambil bentuk singkat P/K/L', () => {
    const kinds = extractClaims('P140 K320 L75').map((c) => c.kind);
    expect(kinds).toEqual(['protein', 'carbs', 'fat']);
  });

  it('TIDAK menganggap gram porsi sebagai klaim makro', () => {
    // Inilah alasan verifikasi tidak menolak semua angka gram: "150g ayam"
    // adalah saran, bukan klaim tentang data user.
    const c = extractClaims('150g ayam + 2 telur udah nutup kok');
    expect(c).toEqual([]);
  });
});

describe('verifyCoachNumbers', () => {
  const truth = truthFromContext(ctx());

  it('meloloskan angka yang berasal dari engine', () => {
    const teks = 'Sisa 820 kkal hari ini. Protein kurang 42g, 150g ayam udah nutup.';
    expect(verifyCoachNumbers(teks, truth).ok).toBe(true);
  });

  it('menoleransi pembulatan kecil', () => {
    expect(verifyCoachNumbers('sisa 825 kkal', truth).ok).toBe(true);
  });

  it('menangkap kalori karangan', () => {
    const hasil = verifyCoachNumbers('Sisa kamu 1.500 kkal', truth);
    expect(hasil.ok).toBe(false);
    expect(hasil.offending[0]).toMatchObject({ kind: 'kcal', value: 1500 });
  });

  it('menangkap protein karangan', () => {
    const hasil = verifyCoachNumbers('protein kurang 250g', truth);
    expect(hasil.ok).toBe(false);
    expect(hasil.offending[0]?.kind).toBe('protein');
  });

  it('99g lolos karena berada dalam toleransi 2% dari 98g yang sudah masuk', () => {
    // Bukan celah: selisih satu gram dari angka engine adalah pembulatan,
    // bukan karangan. Toleransi absolut 1 mencegah angka kecil ditolak
    // hanya karena 2% darinya lebih kecil dari satu satuan.
    expect(verifyCoachNumbers('protein 99g', truth).ok).toBe(true);
  });

  it('balasan tanpa angka selalu lolos', () => {
    expect(verifyCoachNumbers('Mantap, lanjut besok ya', truth).ok).toBe(true);
  });
});

describe('renderDeterministicTemplate', () => {
  it('menyebut sisa dan selalu memberi langkah berikutnya', () => {
    const teks = renderDeterministicTemplate(ctx());
    expect(teks).toContain('820 kkal');
    expect(teks).toContain('42g');
    expect(teks.length).toBeGreaterThan(20);
  });

  it('angkanya sendiri lolos verifikasi — fallback tidak boleh melanggar aturannya', () => {
    const c = ctx();
    const hasil = verifyCoachNumbers(renderDeterministicTemplate(c), truthFromContext(c));
    expect(hasil.ok).toBe(true);
  });

  it('tidak menyalahkan pengguna saat lewat target', () => {
    const teks = renderDeterministicTemplate(
      ctx({ consumed: { kcal: 2950, proteinG: 150, carbsG: 350, fatG: 80 } }),
    );
    expect(teks).toContain('300 kkal');
    expect(teks).toMatch(/besok/i);
    expect(teks).not.toMatch(/gagal|salah|jangan|terlarang/i);
  });
});

describe('detectConcern', () => {
  it('mengembalikan null untuk pesan biasa', () => {
    expect(detectConcern('tadi gue makan nasi padang')).toBeNull();
    expect(detectConcern('malam enaknya makan apa?')).toBeNull();
  });

  it('mendeteksi purging', () => {
    expect(detectConcern('abis makan gue muntahin lagi')?.severity).toBe('eating_disorder');
  });

  it('mendeteksi tidak makan berhari-hari', () => {
    expect(detectConcern('udah 3 hari gak makan')?.severity).toBe('eating_disorder');
  });

  it('mendeteksi rasa bersalah ekstrem', () => {
    expect(detectConcern('gue ngerasa bersalah banget tiap makan')?.severity).toBe(
      'eating_disorder',
    );
  });

  it('mendeteksi krisis', () => {
    expect(detectConcern('gue pengen mati aja')?.severity).toBe('crisis');
  });

  it('mendeteksi konteks medis', () => {
    expect(detectConcern('gue lagi hamil 4 bulan')?.severity).toBe('medical');
    expect(detectConcern('gue ada diabetes')?.severity).toBe('medical');
  });

  it('memenangkan tingkat terberat saat beberapa pola cocok', () => {
    const m = detectConcern('gue hamil tapi tiap abis makan gue muntahin');
    expect(m?.severity).toBe('eating_disorder');
  });

  it('tidak peduli huruf besar dan tanda baca', () => {
    expect(detectConcern('GUE MUNTAHIN LAGI!!!')?.severity).toBe('eating_disorder');
  });
});

describe('concernReply', () => {
  it('tidak memuat satu digit pun', () => {
    // Aturan yang sama dengan layar guardrail onboarding: hasil "block"
    // tidak boleh mengembalikan angka apa pun.
    for (const s of ['crisis', 'eating_disorder', 'medical'] as const) {
      expect(concernReply(s)).not.toMatch(/\d/);
    }
  });

  it('mengarahkan ke tenaga kesehatan, tanpa menghakimi', () => {
    for (const s of ['crisis', 'eating_disorder', 'medical'] as const) {
      const teks = concernReply(s);
      expect(teks.length).toBeGreaterThan(50);
      expect(teks).not.toMatch(/gagal|salah kamu|jangan makan/i);
    }
  });

  it('hanya kasus medis yang tidak menghentikan angka', () => {
    expect(blocksNumbers('medical')).toBe(false);
    expect(blocksNumbers('eating_disorder')).toBe(true);
    expect(blocksNumbers('crisis')).toBe(true);
  });
});
