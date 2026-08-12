import { describe, expect, it } from 'vitest';

import { buildWaUrl } from './waLink';

/**
 * Regresi untuk bug yang ditemukan 13 Agustus 2026: deep link pairing selalu
 * menunjuk ke `6281234567890` — placeholder yang di-hardcode sebagai default
 * karena env yang dibaca komponen (`NEXT_PUBLIC_WA_BUSINESS_NUMBER`) tidak
 * pernah ada. Setiap pengguna diarahkan mengirim token pairingnya ke nomor
 * milik orang lain.
 */
describe('buildWaUrl', () => {
  it('membangun deep link dari nomor E.164', () => {
    expect(buildWaUrl('+628111222333', 'MULAI-RFYEX4')).toBe(
      'https://wa.me/628111222333?text=MULAI-RFYEX4',
    );
  });

  it('membuang tanda plus, spasi, dan hubung — wa.me menolaknya', () => {
    expect(buildWaUrl('+62 811-222-333', 'MULAI-ABC123')).toContain('wa.me/62811222333?');
  });

  it('tidak menggandakan awalan MULAI-', () => {
    expect(buildWaUrl('628111222333', 'MULAI-ABC123')).toContain('text=MULAI-ABC123');
    expect(buildWaUrl('628111222333', 'ABC123')).toContain('text=MULAI-ABC123');
  });

  it('null saat nomor belum dikonfigurasi — bukan tautan cadangan', () => {
    expect(buildWaUrl(undefined, 'MULAI-ABC123')).toBeNull();
    expect(buildWaUrl('', 'MULAI-ABC123')).toBeNull();
    expect(buildWaUrl('   ', 'MULAI-ABC123')).toBeNull();
  });

  it('null untuk nomor yang terlalu pendek untuk masuk akal', () => {
    expect(buildWaUrl('628', 'MULAI-ABC123')).toBeNull();
  });
});
