// Minimal PayMongo REST client and webhook verification.
// Everything is disabled until the env vars below are set:
//
//   PAYMONGO_SECRET_KEY         sk_test_… / sk_live_…            (required for any call)
//   PAYMONGO_WEBHOOK_SECRET     whsk_… from the webhook you register (required to accept webhooks)
//   PAYMONGO_SUBSCRIPTIONS_ENABLED=true   JPTL Professional plan checkout
//   PAYMONGO_QRPH_ENABLED=true            tenant rent via QR Ph
//   PAYMONGO_PAYOUTS_ENABLED=true         landlord payouts (see payouts.service.js before enabling)
//   APP_PUBLIC_URL              e.g. https://app.jptl.ph (checkout return URLs)
//
// UNVERIFIED: written against PayMongo's public API docs, with no live keys.
// Confirm endpoints, payload shapes, and event names in test mode before going live.
import crypto from 'crypto';

const API_BASE = 'https://api.paymongo.com/v1';

export class PayMongoError extends Error {
  constructor(message, statusCode = 502, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const paymongoConfig = () => ({
  configured: Boolean(process.env.PAYMONGO_SECRET_KEY),
  webhookConfigured: Boolean(process.env.PAYMONGO_WEBHOOK_SECRET),
  subscriptions: Boolean(process.env.PAYMONGO_SECRET_KEY) && process.env.PAYMONGO_SUBSCRIPTIONS_ENABLED === 'true',
  qrph: Boolean(process.env.PAYMONGO_SECRET_KEY) && process.env.PAYMONGO_QRPH_ENABLED === 'true',
  payouts: Boolean(process.env.PAYMONGO_SECRET_KEY) && process.env.PAYMONGO_PAYOUTS_ENABLED === 'true',
  livemode: String(process.env.PAYMONGO_SECRET_KEY || '').startsWith('sk_live_'),
});

export function assertFeature(feature) {
  if (!paymongoConfig()[feature]) throw new PayMongoError('This payment feature is not configured yet.', 503);
}

/** Pesos to integer centavos, which is what PayMongo expects. */
export const toCentavos = (pesos) => Math.round(Number(pesos) * 100);

export async function paymongoRequest(method, path, attributes) {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new PayMongoError('PayMongo is not configured.', 503);
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json?.errors?.[0]?.detail || `PayMongo request failed (${response.status})`;
    throw new PayMongoError(detail, response.status >= 500 ? 502 : 400, json?.errors || null);
  }
  return json.data;
}

/**
 * Verify the `Paymongo-Signature` header: "t=<unix>,te=<test sig>,li=<live sig>".
 * Signature = HMAC-SHA256(webhookSecret, `${t}.${rawBody}`). Rejects anything
 * older than `toleranceSeconds` to limit replay.
 */
export function verifyWebhookSignature(rawBody, header, { now = Date.now(), toleranceSeconds = 300 } = {}) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !header || !rawBody) return false;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const given = paymongoConfig().livemode ? parts.li : parts.te;
  if (!given) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(String(given), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
