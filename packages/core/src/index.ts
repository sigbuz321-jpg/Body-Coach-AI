/**
 * @bodycoach/core — domain murni.
 *
 * Dilarang keras di package ini: framework, SDK vendor, dan I/O apa pun
 * (lihat docs/02-technical-spec.md §1). Ditegakkan oleh eslint.config.mjs
 * dan oleh `"types": []` di tsconfig.json.
 *
 * Isi: nutrition/ (M2), pricing (M4), coach/ dan food/ (M5), format (dipakai
 * bersama web dan worker — worker tidak boleh mengimpor paket UI).
 */

export const CORE_PACKAGE = '@bodycoach/core' as const;

export * from './coach';
export * from './food';
export * from './format';
export * from './nutrition';
export * from './pricing';
export * from './time';
