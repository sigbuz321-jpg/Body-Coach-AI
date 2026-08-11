import type { NextConfig } from 'next';

/**
 * Catatan env: `.env.local` ada di root monorepo (satu file untuk web, worker,
 * migration, dan seed), sedangkan Next hanya memuat env file dari direktori
 * app-nya sendiri. File itu dimuat lewat `node --env-file-if-exists=../../.env.local`
 * di script `dev`/`build`/`start` package ini — bukan lewat `loadEnvConfig`
 * di sini, karena route handler dijalankan di proses terpisah yang tidak
 * mewarisi `process.env` hasil pemuatan di next.config.
 *
 * Tanpa itu, `pnpm dev` jalan dan halaman render, tapi setiap endpoint yang
 * menyentuh database gagal validasi env di `@bodycoach/db`.
 */
const nextConfig: NextConfig = {
  // Package internal dikirim sebagai sumber TypeScript (tanpa build step).
  transpilePackages: [
    '@bodycoach/ai',
    '@bodycoach/core',
    '@bodycoach/db',
    '@bodycoach/ui',
    '@bodycoach/whatsapp',
  ],
  // Lint dijalankan sekali untuk seluruh workspace lewat `pnpm lint` di root,
  // memakai eslint.config.mjs — termasuk aturan batas dependency.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
