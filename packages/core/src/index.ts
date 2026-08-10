/**
 * @bodycoach/core — domain murni.
 *
 * Dilarang keras di package ini: framework, SDK vendor, dan I/O apa pun
 * (lihat docs/02-technical-spec.md §1). Ditegakkan oleh eslint.config.mjs
 * dan oleh `"types": []` di tsconfig.json.
 *
 * Isi menyusul: food/ (M6), coach/ (M5).
 */

export const CORE_PACKAGE = '@bodycoach/core' as const;

export * from './nutrition';
