import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Konfigurasi ESLint untuk seluruh workspace.
 *
 * Yang penting di file ini bukan gaya penulisan, melainkan **batas dependency**
 * (docs/02-technical-spec.md §1, CLAUDE.md "Batas dependency"). Aturan itu ada
 * di blok BATAS 1 dan BATAS 2 di bawah, dan wajib dibuktikan benar-benar
 * memblokir — bukan diasumsikan.
 */

/** SDK vendor AI. Hanya boleh muncul di packages/ai/src/providers/. */
const AI_VENDOR_SDKS = [
  '@anthropic-ai/*',
  '@anthropic-ai/**',
  'openai',
  'openai/**',
  '@google/generative-ai',
  '@google/genai',
  '@mistralai/**',
  'cohere-ai',
  // Vercel AI SDK. Diawali garis miring supaya berlabuh di awal specifier:
  // pola no-restricted-imports memakai semantik gitignore, di mana `ai` polos
  // cocok dengan SEGMEN bernama `ai` di mana pun — termasuk `@bodycoach/ai`,
  // package abstraksi kita sendiri, yang justru wajib boleh diimpor.
  '/ai',
  '/ai/**',
];

/** Apa pun yang berarti I/O, framework, atau infrastruktur. */
const IO_AND_FRAMEWORK = [
  // Node builtins
  'node:*',
  'fs',
  'fs/*',
  'path',
  'os',
  'http',
  'https',
  'net',
  'crypto',
  'child_process',
  'worker_threads',
  'stream',
  // Framework UI
  'next',
  'next/**',
  'react',
  'react/**',
  'react-dom',
  'react-dom/**',
  // Database, cache, storage
  'pg',
  'pg/**',
  'postgres',
  'drizzle-orm',
  'drizzle-orm/**',
  '@supabase/**',
  '@upstash/**',
  'ioredis',
  'redis',
  // HTTP client
  'axios',
  'node-fetch',
  'undici',
];

/** Package workspace lain + jalur relatif yang keluar dari packages/core. */
const OTHER_WORKSPACE_PACKAGES = [
  '@bodycoach/ai',
  '@bodycoach/ai/**',
  '@bodycoach/db',
  '@bodycoach/db/**',
  '@bodycoach/ui',
  '@bodycoach/ui/**',
  '@bodycoach/whatsapp',
  '@bodycoach/whatsapp/**',
  '@bodycoach/web',
  '@bodycoach/worker',
  // Jalur relatif yang menembus keluar dari packages/core/
  '**/apps/**',
  '**/packages/ai/**',
  '**/packages/db/**',
  '**/packages/ui/**',
  '**/packages/whatsapp/**',
  '../../../**',
];

const CORE_BOUNDARY_MESSAGE =
  'packages/core adalah domain murni: dilarang mengimpor framework, SDK vendor, package workspace lain, atau melakukan I/O. Lihat CLAUDE.md "Batas dependency" dan docs/02-technical-spec.md §1.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/web/next-env.d.ts',
      // Output desain, bukan kode produksi.
      'design/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Rule dasar dimatikan; versi TypeScript-nya juga menangkap `import type`.
      'no-restricted-imports': 'off',
    },
  },

  // ── BATAS 1 ─────────────────────────────────────────────────────────────
  // SDK vendor AI hanya boleh di packages/ai/src/providers/ (CLAUDE.md).
  {
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: AI_VENDOR_SDKS,
              message:
                'SDK vendor AI hanya boleh di-import di packages/ai/src/providers/. Di tempat lain, pakai abstraksi dari @bodycoach/ai.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/ai/src/providers/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },

  // ── BATAS 2 ─────────────────────────────────────────────────────────────
  // packages/core: domain murni, tanpa framework/SDK/I/O/package lain.
  // Blok ini datang setelah BATAS 1 sehingga menimpa aturannya untuk core.
  {
    files: ['packages/core/**/*.ts', 'packages/core/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...OTHER_WORKSPACE_PACKAGES, ...IO_AND_FRAMEWORK, ...AI_VENDOR_SDKS],
              message: CORE_BOUNDARY_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  // File konfigurasi di root berjalan di Node.
  {
    files: ['*.config.{ts,mjs,js}', 'eslint.config.mjs'],
    rules: {
      '@typescript-eslint/no-restricted-imports': 'off',
    },
  },

  prettier,
);
