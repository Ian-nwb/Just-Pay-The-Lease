import { base32Encode, totpAt, verifyTotp, generateSecret } from './totp.js';

// RFC 6238 Appendix B (SHA-1), last 6 digits.
const secret = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('matches RFC 6238 test vectors', () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpAt(secret, Math.floor(2000000000 / 30))).toBe('279037');
  });

  it('accepts one step of drift and returns the matched step', () => {
    const now = 1111111109 * 1000;
    const step = Math.floor(1111111109 / 30);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), now)).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(verifyTotp(secret, '12345', Date.now())).toBeNull();
    expect(verifyTotp(secret, 'abcdef', Date.now())).toBeNull();
  });

  it('generates 32-character base32 secrets', () => {
    expect(generateSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });
});
