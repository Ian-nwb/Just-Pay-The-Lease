import crypto from 'crypto';
import { verifyWebhookSignature, toCentavos } from './paymongo.client.js';

const body = JSON.stringify({ data: { id: 'evt_1', attributes: { type: 'payment.paid' } } });
const sign = (t, secret = 'whsk_test') => crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

describe('PayMongo webhook signature', () => {
  const env = { ...process.env };
  beforeEach(() => { process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_test'; process.env.PAYMONGO_SECRET_KEY = 'sk_test_x'; });
  afterAll(() => { process.env = env; });

  it('accepts a valid test-mode signature within tolerance', () => {
    const t = 1_700_000_000;
    expect(verifyWebhookSignature(body, `t=${t},te=${sign(t)},li=`, { now: t * 1000 })).toBe(true);
  });

  it('rejects a tampered body, wrong secret, or stale timestamp', () => {
    const t = 1_700_000_000;
    expect(verifyWebhookSignature(`${body} `, `t=${t},te=${sign(t)}`, { now: t * 1000 })).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},te=${sign(t, 'other')}`, { now: t * 1000 })).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},te=${sign(t)}`, { now: (t + 600) * 1000 })).toBe(false);
  });

  it('uses the live signature with a live key', () => {
    process.env.PAYMONGO_SECRET_KEY = 'sk_live_x';
    const t = 1_700_000_000;
    expect(verifyWebhookSignature(body, `t=${t},te=${sign(t)},li=`, { now: t * 1000 })).toBe(false);
    expect(verifyWebhookSignature(body, `t=${t},te=,li=${sign(t)}`, { now: t * 1000 })).toBe(true);
  });

  it('converts pesos to integer centavos', () => {
    expect(toCentavos(500)).toBe(50000);
    expect(toCentavos(0.1 + 0.2)).toBe(30);
  });
});
