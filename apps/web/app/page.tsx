import Link from 'next/link';

/**
 * Placeholder root — halaman landing dibangun di M4.
 * Untuk sekarang hanya tautan masuk ke onboarding supaya engineer bisa
 * mengetes alur dengan cepat.
 */
export default function Page() {
  return (
    <main
      style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'var(--font-body)',
        color: 'var(--iron-900)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 40,
          lineHeight: '44px',
          letterSpacing: '-0.02em',
          margin: '40px 0 8px',
        }}
      >
        AI Body Coach
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 32px' }}>
        Landing page menyusul di M4. Untuk sekarang, masuk ke wizard onboarding.
      </p>
      <Link
        href="/onboarding"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 52,
          padding: '0 24px',
          background: 'var(--iron-900)',
          color: 'var(--enamel-0)',
          borderRadius: 999,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Mulai onboarding
      </Link>
    </main>
  );
}
