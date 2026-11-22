// JPTL Professional plan via PayMongo hosted Checkout.
// PayMongo Checkout is one-off, so each month is a new checkout. The webhook,
// not the browser redirect, extends the period. After the period ends there
// is a grace window; then the plan drops to Starter. No data is deleted: plan
// caps only block adding more properties/units.
import User from '../../models/user.model.js';
import AuditLog from '../../models/auditLog.model.js';
import { Subscription, SubscriptionInvoice } from '../../models/billing.model.js';
import { createNotification } from '../notification.service.js';
import { assertFeature, paymongoConfig, paymongoRequest, toCentavos, PayMongoError } from './paymongo.client.js';

export const PRO_PRICE_PESOS = 500;
const PERIOD_DAYS = 30;
const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

async function getOrCreate(landlordId) {
  return Subscription.findOneAndUpdate({ landlord: landlordId }, { $setOnInsert: { landlord: landlordId } }, { upsert: true, new: true });
}

export async function getBillingOverview(landlordId) {
  const [subscription, invoices, user] = await Promise.all([
    Subscription.findOne({ landlord: landlordId }).lean(),
    SubscriptionInvoice.find({ landlord: landlordId }).sort({ createdAt: -1 }).limit(24).lean(),
    User.findById(landlordId).select('plan').lean(),
  ]);
  return {
    enabled: paymongoConfig().subscriptions,
    price: PRO_PRICE_PESOS,
    plan: user?.plan || 'starter',
    status: subscription?.status || 'none',
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    graceEndsAt: subscription?.graceEndsAt || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    history: invoices.map((i) => ({ id: i._id, amount: i.amount, status: i.status, periodStart: i.periodStart, periodEnd: i.periodEnd, paidAt: i.paidAt, createdAt: i.createdAt })),
  };
}

/** Create a hosted checkout for one Professional month (new, renewal, or retry). */
export async function createProCheckout(landlordId) {
  assertFeature('subscriptions');
  const base = process.env.APP_PUBLIC_URL;
  if (!base) throw new PayMongoError('APP_PUBLIC_URL is not configured.', 503);
  const landlord = await User.findById(landlordId).select('email firstName lastName').lean();
  if (!landlord) throw new PayMongoError('Landlord not found.', 404);

  const session = await paymongoRequest('POST', '/checkout_sessions', {
    line_items: [{ name: 'JPTL Professional (30 days)', amount: toCentavos(PRO_PRICE_PESOS), currency: 'PHP', quantity: 1 }],
    payment_method_types: ['card', 'gcash', 'paymaya', 'qrph'],
    description: 'JPTL Professional plan',
    send_email_receipt: true,
    show_line_items: true,
    billing: { email: landlord.email, name: `${landlord.firstName || ''} ${landlord.lastName || ''}`.trim() || landlord.email },
    success_url: `${base}/dashboard-settings?billing=success`,
    cancel_url: `${base}/dashboard-settings?billing=cancelled`,
    metadata: { jptl_kind: 'subscription', landlord_id: String(landlordId), plan: 'pro' },
  });
  await SubscriptionInvoice.create({ landlord: landlordId, plan: 'pro', amount: PRO_PRICE_PESOS, checkoutSessionId: session.id, checkoutUrl: session.attributes?.checkout_url || '' });
  return { checkoutUrl: session.attributes?.checkout_url };
}

export async function cancelAtPeriodEnd(landlordId, cancel = true) {
  const sub = await getOrCreate(landlordId);
  sub.cancelAtPeriodEnd = Boolean(cancel);
  await sub.save();
  return getBillingOverview(landlordId);
}

/** Webhook handler for a paid subscription checkout. Idempotent per checkout session. */
export async function handleSubscriptionPaid({ checkoutSessionId, paymentId, landlordId }) {
  const invoice = await SubscriptionInvoice.findOne({ checkoutSessionId });
  if (!invoice) return { ignored: 'unknown_checkout' };
  if (String(invoice.landlord) !== String(landlordId)) return { ignored: 'landlord_mismatch' };
  if (invoice.status === 'paid') return { ignored: 'already_paid' };

  const sub = await getOrCreate(invoice.landlord);
  const now = new Date();
  // Paying early extends from the current end; paying late starts from today.
  const start = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
  const end = new Date(start.getTime() + PERIOD_DAYS * DAY_MS);

  invoice.status = 'paid';
  invoice.paidAt = now;
  invoice.providerPaymentId = paymentId || null;
  invoice.periodStart = start;
  invoice.periodEnd = end;
  await invoice.save();

  const continuing = sub.status === 'active' && sub.currentPeriodStart;
  sub.plan = 'pro';
  sub.currentPeriodStart = continuing ? sub.currentPeriodStart : start;
  sub.status = 'active';
  sub.currentPeriodEnd = end;
  sub.graceEndsAt = null;
  sub.cancelAtPeriodEnd = false;
  await sub.save();
  await User.updateOne({ _id: invoice.landlord }, { $set: { plan: 'pro' } });

  await AuditLog.create({ actor: invoice.landlord, actorRole: 'landlord', action: 'SUBSCRIPTION_PAID', entityKind: 'User', entityId: invoice.landlord, afterState: { plan: 'pro', periodEnd: end, checkoutSessionId } }).catch(() => {});
  await createNotification({ userId: invoice.landlord, title: 'Professional plan active', body: `Your Professional plan is active until ${end.toDateString()}.`, type: 'system' });
  return { processed: true };
}

/** Daily: move expired subscriptions to past_due, then downgrade after grace. */
export async function runSubscriptionLifecycle(now = new Date()) {
  let pastDue = 0;
  let downgraded = 0;
  const expiring = await Subscription.find({ status: 'active', currentPeriodEnd: { $lte: now } });
  for (const sub of expiring) {
    sub.status = sub.cancelAtPeriodEnd ? 'canceled' : 'past_due';
    sub.graceEndsAt = sub.cancelAtPeriodEnd ? now : new Date(sub.currentPeriodEnd.getTime() + GRACE_DAYS * DAY_MS);
    await sub.save();
    pastDue += 1;
    if (!sub.cancelAtPeriodEnd) {
      await createNotification({ userId: sub.landlord, title: 'Professional plan payment due', body: `Renew by ${sub.graceEndsAt.toDateString()} to keep Professional limits. Your data is not affected.`, type: 'system' });
    }
  }
  const lapsed = await Subscription.find({ status: { $in: ['past_due', 'canceled'] }, plan: 'pro', graceEndsAt: { $lte: now } });
  for (const sub of lapsed) {
    sub.plan = 'starter';
    if (sub.status === 'past_due') sub.status = 'canceled';
    await sub.save();
    await User.updateOne({ _id: sub.landlord, plan: 'pro' }, { $set: { plan: 'starter' } });
    await createNotification({ userId: sub.landlord, title: 'Moved to Starter plan', body: 'Your Professional plan ended. Existing properties and units stay; adding more needs Starter limits or a renewed plan.', type: 'system' });
    downgraded += 1;
  }
  return { pastDue, downgraded };
}

/** When billing is live, plan upgrades can only come from a paid subscription. */
export function billingEnforced() {
  return paymongoConfig().subscriptions;
}
