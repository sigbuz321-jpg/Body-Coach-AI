import { defineConfig } from 'vitest/config';

// Test bersebelahan dengan sumbernya (`*.test.ts`), sesuai konvensi di CLAUDE.md.
// Satu config di root: seluruh workspace dijalankan dengan `pnpm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{apps,packages,tooling}/*/src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['{apps,packages}/*/src/**/*.ts'],
      // types.ts hanya berisi deklarasi tipe: setelah TypeScript dilucuti,
      // modulnya kosong dan v8 melaporkan seluruh barisnya tidak tereksekusi.
      // index.ts adalah barrel, fixtures.ts hanya dipakai test.
      exclude: ['**/*.test.ts', '**/fixtures.ts', '**/index.ts', '**/types.ts'],
      // Nutrition engine adalah fondasi kepercayaan produk ini. Cabang yang
      // tidak teruji di sini berarti angka yang tidak pernah diperiksa sampai
      // ada pengguna yang menerimanya.
      thresholds: {
        'packages/core/src/nutrition/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
