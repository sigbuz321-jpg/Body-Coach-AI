/**
 * Lapisan food — bagian domain murni dari food resolver (§5).
 *
 * Pencocokan ke database (alias, trigram, vektor) ada di `@bodycoach/db`;
 * yang di sini hanya normalisasi teks dan pemecahan kalimat, karena keduanya
 * tidak butuh I/O dan justru paling banyak butuh test.
 */

export { normalizeFoodQuery, nutritionForGrams, splitFoodItems } from './normalize';
export type { NormalizedQuery, Nutrition, Per100g } from './normalize';
