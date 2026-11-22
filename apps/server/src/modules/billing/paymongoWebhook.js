// POST /api/webhooks/paymongo. Mounted with express.raw() before express.json()
// so the signature is checked against the exact bytes PayMongo signed.
import { ProviderEvent } from '../../shared/models/billing.model.js';
import { verifyWebhookSignature } from '../../shared/services/paymongo/paymongo.client.js';
import { handleSubscriptionPaid } from '../../shared/services/paymongo/subscription.service.js';
import { handleRentPaid, handleRentFailed } from '../../shared/services/paymongo/rentCollection.service.js';
import { handlePayoutStatus } from '../../shared/services/paymongo/payouts.service.js';

const PAYOUT_STATUS = { paid: 'paid', succeeded: 'paid', failed: 'failed', reversed: 'reversed', returned: 'reversed', processing: 'processing', pending: 'processing' };

async function dispatch(type, resource) {
  const attrs = resource?.attributes || {};
  if (type === 'checkout_session.payment.paid') {
    if (attrs.metadata?.jptl_kind !== 'subscription') return { ignored: 'not_subscription' };
    return handleSubscriptionPaid({ checkoutSessionId: resource.id, paymentId: attrs.payments?.[0]?.id || null, landlordId: attrs.metadata?.landlord_id });
  }
  if (type === 'payment.paid') {
    if (!attrs.payment_intent_id) return { ignored: 'no_intent' };
    return handleRentPaid({ paymentIntentId: attrs.payment_intent_id, providerPaymentId: resource.id, amountCentavos: attrs.amount });
  }
  if (type === 'payment.failed') {
    return attrs.payment_intent_id ? handleRentFailed({ paymentIntentId: attrs.payment_intent_id }) : { ignored: 'no_intent' };
  }
  // UNVERIFIED payout event names; see payouts.service.js.
  if (/^(payout|transfer)\./.test(type)) {
    const status = PAYOUT_STATUS[type.split('.').pop()] || PAYOUT_STATUS[attrs.status];
    if (!status) return { ignored: 'unknown_payout_status' };
    return handlePayoutStatus({ providerReference: resource.id, status, reason: attrs.failure_reason || attrs.status_reason || '' });
  }
  return { ignored: 'unhandled_type' };
}

export async function paymongoWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifyWebhookSignature(rawBody, req.get('paymongo-signature'))) {
    return res.status(401).json({ success: false, message: 'Invalid signature' });
  }
  let event;
  try { event = JSON.parse(rawBody)?.data; } catch { return res.status(400).json({ success: false, message: 'Invalid JSON' }); }
  const eventId = event?.id;
  const type = event?.attributes?.type;
  if (!eventId || !type) return res.status(400).json({ success: false, message: 'Missing event id or type' });

  const existing = await ProviderEvent.findOne({ eventId }).lean();
  if (existing && existing.status !== 'failed') return res.status(200).json({ success: true, duplicate: true });

  try {
    const result = await dispatch(type, event.attributes.data);
    await ProviderEvent.updateOne(
      { eventId },
      { $set: { type, livemode: Boolean(event.attributes.livemode), status: result?.ignored ? 'ignored' : 'processed', error: result?.ignored || '', payload: event } },
      { upsert: true }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('PayMongo webhook processing failed:', error.message);
    await ProviderEvent.updateOne({ eventId }, { $set: { type, status: 'failed', error: error.message, payload: event } }, { upsert: true }).catch(() => {});
    return res.status(500).json({ success: false }); // non-2xx so PayMongo retries
  }
}
