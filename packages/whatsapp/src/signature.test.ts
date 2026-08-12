import { describe, expect, it } from 'vitest';

import { computeSignature, verifySignature, verifyWebhookChallenge } from './signature';

const SECRET = 'rahasia-aplikasi-meta';
const BODY = '{"object":"whatsapp_business_account","entry":[]}';

describe('verifySignature', () => {
  it('menerima tanda tangan yang benar', () => {
    expect(verifySignature(BODY, computeSignature(BODY, SECRET), SECRET)).toBe(true);
  });

  it('menolak tanda tangan dari body lain', () => {
    const lain = computeSignature('{"object":"lain"}', SECRET);
    expect(verifySignature(BODY, lain, SECRET)).toBe(false);
  });

  it('menolak tanda tangan dari secret lain', () => {
    expect(verifySignature(BODY, computeSignature(BODY, 'secret-salah'), SECRET)).toBe(false);
  });

  it('menolak header yang hilang atau tanpa prefix sha256=', () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifySignature(BODY, '', SECRET)).toBe(false);
    expect(verifySignature(BODY, 'abc123', SECRET)).toBe(false);
    expect(verifySignature(BODY, 'sha1=abc123', SECRET)).toBe(false);
  });

  it('menolak semuanya saat app secret belum dikonfigurasi', () => {
    // Endpoint webhook publik. Kalau secret kosong berarti belum siap
    // menerima apa pun — bukan berarti boleh menerima semuanya.
    expect(verifySignature(BODY, computeSignature(BODY, ''), '')).toBe(false);
  });

  it('peka terhadap byte, bukan terhadap struktur JSON', () => {
    // Inilah alasan handler wajib memverifikasi req.text() mentah:
    // JSON yang sama secara semantik menghasilkan tanda tangan berbeda.
    const sig = computeSignature(BODY, SECRET);
    const diformatUlang = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifySignature(diformatUlang, sig, SECRET)).toBe(false);
  });

  it('tidak melempar untuk header dengan panjang aneh', () => {
    expect(verifySignature(BODY, 'sha256=' + 'a'.repeat(3), SECRET)).toBe(false);
    expect(verifySignature(BODY, 'sha256=' + 'a'.repeat(500), SECRET)).toBe(false);
  });
});

describe('verifyWebhookChallenge', () => {
  const TOKEN = 'token-verifikasi';

  function params(o: Record<string, string>): URLSearchParams {
    return new URLSearchParams(o);
  }

  it('memantulkan challenge saat mode dan token cocok', () => {
    const res = verifyWebhookChallenge(
      params({ 'hub.mode': 'subscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '12345' }),
      TOKEN,
    );
    expect(res).toEqual({ ok: true, challenge: '12345' });
  });

  it('menolak token yang salah', () => {
    const res = verifyWebhookChallenge(
      params({ 'hub.mode': 'subscribe', 'hub.verify_token': 'salah', 'hub.challenge': '1' }),
      TOKEN,
    );
    expect(res.ok).toBe(false);
  });

  it('menolak mode selain subscribe', () => {
    const res = verifyWebhookChallenge(
      params({ 'hub.mode': 'unsubscribe', 'hub.verify_token': TOKEN, 'hub.challenge': '1' }),
      TOKEN,
    );
    expect(res.ok).toBe(false);
  });

  it('menolak saat verify token belum dikonfigurasi', () => {
    const res = verifyWebhookChallenge(
      params({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }),
      '',
    );
    expect(res.ok).toBe(false);
  });
});
