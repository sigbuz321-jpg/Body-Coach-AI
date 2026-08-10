import { defineConfig } from 'vitest/config';

// Test bersebelahan dengan sumbernya (`*.test.ts`), sesuai konvensi di CLAUDE.md.
// Satu config di root: seluruh workspace dijalankan dengan `pnpm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['{apps,packages,tooling}/*/src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
