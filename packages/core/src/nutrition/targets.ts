import { computeBmr, computeTdee } from './bmr';
import {
  BMR_FLOOR_MULTIPLIER,
  CONSERVATIVE_TDEE_FLOOR,
  ENGINE_VERSION,
  FAT_G_PER_KG_MIN,
  FAT_PCT_OF_KCAL,
  KCAL_FLOOR,
  KCAL_PER_G_CARBS,
  KCAL_PER_G_FAT,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_KG_BW,
  PROTEIN_G_PER_KG,
  PROTEIN_G_PER_KG_MAX,
  RATE,
} from './constants';
import type { Profile, TargetSet } from './types';

/** Energi yang dijelaskan oleh protein dan lemak saja. */
export function macroEnergy(proteinG: number, fatG: number): number {
  return proteinG * KCAL_PER_G_PROTEIN + fatG * KCAL_PER_G_FAT;
}

/**
 * Target harian. Implementasi docs/02-technical-spec.md §4.2.
 *
 * Murni: tidak membaca jam, tidak melakukan I/O, hasilnya hanya bergantung
 * pada argumen. `currentYear` diminta eksplisit karena itu.
 */
export function computeTargets(p: Profile, currentYear: number): TargetSet {
  // 1–2. BMR dan TDEE
  const bmr = computeBmr(p, currentYear);
  const tdee = computeTdee(bmr, p);

  // 3. Laju target sebagai fraksi berat badan per minggu
  const rate = RATE[p.goal].default;
  const weeklyKg = p.weightKg * rate * (p.goal === 'cut' ? -1 : 1);

  // 4. Adjustment kalori diturunkan dari laju, bukan dari persentase TDEE —
  //    lebih akurat lintas ukuran tubuh.
  const dailyAdj = (weeklyKg * KCAL_PER_KG_BW) / 7;
  let kcal = Math.round(tdee + dailyAdj);

  // 5. Safety clamp
  kcal = Math.max(kcal, KCAL_FLOOR[p.sex], Math.round(bmr * BMR_FLOOR_MULTIPLIER));
  if (p.conservativeMode) {
    kcal = Math.max(kcal, Math.round(tdee * CONSERVATIVE_TDEE_FLOOR));
  }

  // 6. Makro: protein dulu, lemak minimum, sisanya karbo.
  const proteinRef = p.goal === 'cut' ? Math.min(p.weightKg, p.targetWeightKg) : p.weightKg;
  const proteinG = Math.round(
    Math.min(PROTEIN_G_PER_KG[p.goal], PROTEIN_G_PER_KG_MAX) * proteinRef,
  );

  const fatFromPct = (kcal * FAT_PCT_OF_KCAL) / KCAL_PER_G_FAT;
  const fatG = Math.round(Math.max(fatFromPct, FAT_G_PER_KG_MIN * p.weightKg));

  // [DEVIASI] §4.2 langsung menghitung karbo dari sisa dan menahannya di 0.
  // Untuk sebagian profil — berat tinggi pada tubuh pendek, di mana kalori
  // ditahan oleh clamp BMR×1.05 — protein dan lemak minimum saja sudah
  // melebihi kalori target. Rumus asli menghasilkan karbo 0 dan rencana yang
  // tidak menjumlah: §4.4 mensyaratkan `protein×4 + lemak×9 <= kcal`, dan
  // profil seperti itu melanggarnya.
  //
  // Contoh nyata dari property test: wanita 120 cm, 100 kg, 65 tahun, cut ke
  // 90 kg → kcal 1327, tetapi protein 198 g + lemak 60 g = 1332 kkal.
  //
  // Penyelesaiannya menaikkan kalori agar menutup kedua batas bawah tersebut.
  // Hanya pernah menaikkan, jadi seluruh safety clamp di langkah 5 tetap
  // berlaku, dan rencananya menjadi koheren: target tidak boleh lebih kecil
  // dari protein dan lemak esensial yang diresepkannya sendiri.
  const floorFromMacros = macroEnergy(proteinG, fatG);
  if (floorFromMacros > kcal) {
    kcal = floorFromMacros;
  }

  const carbsG = Math.max(0, Math.round((kcal - floorFromMacros) / KCAL_PER_G_CARBS));

  return { bmr, tdee, kcal, proteinG, carbsG, fatG, weeklyKg, engineVersion: ENGINE_VERSION };
}
