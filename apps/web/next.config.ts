import type { NextConfig } from 'next';

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
