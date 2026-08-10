import { CORE_PACKAGE } from '@bodycoach/core';
import { DB_PACKAGE } from '@bodycoach/db';
import { UI_PACKAGE } from '@bodycoach/ui';

/**
 * Halaman sementara M0. Isinya bukan produk — ini bukti bahwa resolusi
 * package lintas workspace benar-benar bekerja di dalam Next.js.
 * Diganti seluruhnya oleh landing page di M4.
 */
const WIRED = [CORE_PACKAGE, DB_PACKAGE, UI_PACKAGE];

export default function Page() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 32, lineHeight: '36px', margin: '40px 0 8px' }}>AI Body Coach</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 32px' }}>
        M0 — scaffolding. Landing page yang sebenarnya dibangun di M4.
      </p>

      <section
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 17, lineHeight: '26px', margin: '0 0 12px' }}>
          Package yang tersambung
        </h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)' }}>
          {WIRED.map((name) => (
            <li key={name} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
              {name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
