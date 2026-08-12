import { describe, expect, it } from 'vitest';

import { looksLikeQuestion } from './intent';
import { verifyCoachNumbers } from './numbers';
import {
  remainingAfter,
  renderFoodLogPreview,
  renderLogConfirmed,
  renderNotLinked,
  renderPaired,
  renderPairFailure,
  renderWeightSaved,
  sumItems,
  truthForItems,
  type LoggedItemView,
} from './reply';
import { truthFromContext } from './numbers';
import type { CoachContext } from './types';
import { toWhatsAppText } from './wa-text';
import { parseWeightMessage } from './weight';

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

const NASI: LoggedItemView = {
  label: 'Nasi putih',
  grams: 150,
  kcal: 195,
  proteinG: 4,
  carbsG: 42,
  fatG: 0,
  needsCheck: false,
};

const GEPREK: LoggedItemView = {
  label: 'Ayam geprek',
  grams: 120,
  kcal: 342,
  proteinG: 25,
  carbsG: 14,
  fatG: 22,
  needsCheck: false,
};

describe('renderFoodLogPreview', () => {
  it('mendaftar tiap item dengan gizinya sendiri', () => {
    const teks = renderFoodLogPreview({ ctx: ctx(), items: [NASI, GEPREK], unresolved: [] });

    expect(teks).toContain('Nasi putih 150 g — ±195 kkal · P4 K42 L0');
    expect(teks).toContain('Ayam geprek 120 g — ±342 kkal · P25 K14 L22');
  });

  it('menyertakan total hanya kalau itemnya lebih dari satu', () => {
    expect(renderFoodLogPreview({ ctx: ctx(), items: [NASI, GEPREK], unresolved: [] })).toContain(
      'Total ±537 kkal · P29 K56 L22.',
    );
    expect(renderFoodLogPreview({ ctx: ctx(), items: [NASI], unresolved: [] })).not.toContain(
      'Total',
    );
  });

  it('menulis sisa sebagai bersyarat — lognya belum dikonfirmasi', () => {
    const teks = renderFoodLogPreview({ ctx: ctx(), items: [NASI, GEPREK], unresolved: [] });

    // 2650 − (1830 + 537) = 283
    expect(teks).toContain('Kalau dicatat, sisa ±283 kkal');
    // 140 − (98 + 29) = 13
    expect(teks).toContain('protein kurang 13g');
  });

  it('menyebut item yang tidak ketemu tanpa menebak angkanya', () => {
    const teks = renderFoodLogPreview({
      ctx: ctx(),
      items: [NASI],
      unresolved: ['salad buah naga'],
    });

    expect(teks).toContain('"salad buah naga"');
    expect(teks).toContain('lebih spesifik');
  });

  it('menandai item yang perlu dicek', () => {
    const teks = renderFoodLogPreview({
      ctx: ctx(),
      items: [{ ...NASI, needsCheck: true }],
      unresolved: [],
    });
    expect(teks).toContain('(perlu dicek)');
  });

  it('tidak menghakimi saat target terlewat', () => {
    const teks = renderFoodLogPreview({
      ctx: ctx({ consumed: { kcal: 2600, proteinG: 140, carbsG: 320, fatG: 75 } }),
      items: [GEPREK],
      unresolved: [],
    });

    // 2600 + 342 − 2650 = 292
    expect(teks).toContain('lewat target 292 kkal');
    expect(teks).toContain('besok normal lagi aja');
    expect(teks).not.toMatch(/gagal|salah|jangan/i);
  });

  it('memakai format id-ID untuk ribuan', () => {
    const teks = renderFoodLogPreview({
      ctx: ctx({ consumed: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } }),
      items: [NASI],
      unresolved: [],
    });
    expect(teks).toContain('±2.455 kkal');
  });
});

describe('remainingAfter', () => {
  it('menghitung sisa seandainya item dicatat', () => {
    const sisa = remainingAfter(ctx(), [NASI, GEPREK]);
    expect(sisa.kcal).toBe(283);
    expect(sisa.proteinG).toBe(13);
    expect(sisa.overKcal).toBe(false);
  });

  it('tidak mengubah konteks aslinya', () => {
    const c = ctx();
    remainingAfter(c, [NASI]);
    expect(c.consumed.kcal).toBe(1830);
  });
});

describe('sumItems', () => {
  it('nol untuk daftar kosong', () => {
    expect(sumItems([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('renderLogConfirmed', () => {
  it('memakai kata kerja yang sama dengan tombolnya', () => {
    // Aturan copy: tombol "Catat" -> konfirmasi "Tercatat."
    expect(renderLogConfirmed(ctx())).toMatch(/^Tercatat\./);
  });

  it('mengawali kalimat berikutnya dengan huruf besar', () => {
    expect(renderLogConfirmed(ctx())).toContain('Tercatat. Sisa ±820 kkal');
    expect(
      renderLogConfirmed(ctx({ consumed: { kcal: 3000, proteinG: 200, carbsG: 400, fatG: 90 } })),
    ).toContain('Tercatat. Lewat target 350 kkal.');
  });

  it('selalu memberi langkah berikutnya', () => {
    expect(renderLogConfirmed(ctx())).toMatch(/ayam sama telur|besok/i);
  });
});

describe('renderPaired', () => {
  it('menyapa dengan nama dan menyebut target', () => {
    const teks = renderPaired(ctx());
    expect(teks).toContain('Halo Daffa!');
    expect(teks).toContain('2.650 kkal');
  });

  it('tetap sopan tanpa nama', () => {
    expect(renderPaired(ctx({ displayName: null }))).toMatch(/^Halo!/);
  });
});

describe('renderNotLinked', () => {
  it('tidak memuat satu angka pun — nomornya belum tentu milik siapa', () => {
    const teks = renderNotLinked('https://contoh.id');
    expect(teks).not.toMatch(/\d+\s*(kkal|kalori|g\b)/i);
    expect(teks).toContain('https://contoh.id');
  });
});

describe('renderPairFailure', () => {
  it('menjelaskan sebab dan memberi jalan keluar untuk tiap kasus', () => {
    for (const kind of ['not_found', 'expired', 'already_used', 'wa_taken'] as const) {
      const teks = renderPairFailure(kind, 'https://contoh.id');
      expect(teks.length).toBeGreaterThan(20);
      expect(teks).not.toMatch(/error|gagal total/i);
    }
    expect(renderPairFailure('expired', 'https://contoh.id')).toContain('24 jam');
  });
});

describe('renderWeightSaved', () => {
  it('mengarahkan ritme timbang saat belum ada pembanding', () => {
    expect(renderWeightSaved(70, null)).toContain('Tercatat, 70,0 kg.');
    expect(renderWeightSaved(70, null)).toMatch(/3–4 hari/);
  });

  it('menyebut arah dan besar perubahan', () => {
    expect(renderWeightSaved(70.8, 70)).toContain('Naik 0,8 kg');
    expect(renderWeightSaved(69.2, 70)).toContain('Turun 0,8 kg');
  });

  it('menyebut stabil untuk selisih di bawah 50 gram', () => {
    expect(renderWeightSaved(70.02, 70)).toContain('Stabil');
  });
});

describe('truthForItems', () => {
  it('mengizinkan angka item, total, dan sisa setelahnya', () => {
    const truth = truthForItems(ctx(), [NASI, GEPREK], truthFromContext(ctx()));

    expect(verifyCoachNumbers('nasi tadi ±195 kkal', truth).ok).toBe(true);
    expect(verifyCoachNumbers('totalnya ±537 kkal', truth).ok).toBe(true);
    expect(verifyCoachNumbers('sisa ±283 kkal', truth).ok).toBe(true);
    expect(verifyCoachNumbers('nasi tadi ±870 kkal', truth).ok).toBe(false);
  });
});

describe('parseWeightMessage', () => {
  it('menangkap bentuk yang benar-benar dipakai orang', () => {
    expect(parseWeightMessage('berat gue 70,5')).toBe(70.5);
    expect(parseWeightMessage('bb sekarang 68 kg')).toBe(68);
    expect(parseWeightMessage('berat badan: 82')).toBe(82);
    expect(parseWeightMessage('70,2 kg')).toBe(70.2);
    expect(parseWeightMessage('timbangan 75kg')).toBe(75);
  });

  it('tidak menangkap kalimat makanan', () => {
    expect(parseWeightMessage('nasi padang sama teh manis')).toBeNull();
    expect(parseWeightMessage('2 potong ayam geprek')).toBeNull();
    // Gram makanan bukan berat badan.
    expect(parseWeightMessage('ayam 150 g')).toBeNull();
  });

  it('menolak angka di luar batas constraint weight_entries', () => {
    expect(parseWeightMessage('berat gue 12 kg')).toBeNull();
    expect(parseWeightMessage('berat gue 900 kg')).toBeNull();
  });
});

describe('toWhatsAppText', () => {
  /**
   * WhatsApp bukan Markdown. Model tetap memakainya — contoh di bawah diambil
   * apa adanya dari balasan nyata pada uji live 13 Agustus 2026.
   */
  it('mengubah tebal ganda jadi tebal WhatsApp', () => {
    expect(toWhatsAppText('**Saran malam ini:** ayam bakar')).toBe('*Saran malam ini:* ayam bakar');
  });

  it('tidak menyatukan dua pasang tebal jadi satu', () => {
    expect(toWhatsAppText('**Ayam bakar** dan **Nasi putih**')).toBe(
      '*Ayam bakar* dan *Nasi putih*',
    );
  });

  it('menurunkan judul Markdown jadi baris tebal', () => {
    expect(toWhatsAppText('### Saran\nayam bakar')).toBe('*Saran*\nayam bakar');
  });

  it('menyeragamkan penanda daftar', () => {
    expect(toWhatsAppText('- ayam bakar\n- nasi putih')).toBe('• ayam bakar\n• nasi putih');
  });

  it('membiarkan tebal WhatsApp yang sudah benar', () => {
    expect(toWhatsAppText('*Protein* lo kurang 42g.')).toBe('*Protein* lo kurang 42g.');
  });

  it('tidak menyentuh angka', () => {
    expect(toWhatsAppText('**±283 kkal** sisa')).toContain('±283 kkal');
  });
});

describe('looksLikeQuestion', () => {
  it('mengenali pertanyaan yang akan salah tercatat sebagai makanan', () => {
    expect(looksLikeQuestion('malam makan apa?')).toBe(true);
    expect(looksLikeQuestion('enaknya makan ayam geprek gak ya')).toBe(true);
    expect(looksLikeQuestion('berapa kalori nasi padang')).toBe(true);
    expect(looksLikeQuestion('saranin makan malam dong')).toBe(true);
  });

  it('membiarkan laporan makan lewat', () => {
    expect(looksLikeQuestion('tadi gue makan nasi sama ayam geprek')).toBe(false);
    expect(looksLikeQuestion('nasi padang seporsi')).toBe(false);
    expect(looksLikeQuestion('')).toBe(false);
  });
});
