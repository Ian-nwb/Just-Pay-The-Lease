import mongoose from 'mongoose';

// JPTL's own SaaS billing. Kept apart from landlord rent (Payment) on purpose.

// Every processed provider webhook, keyed by provider event id (idempotency).
const providerEventSchema = new mongoose.Schema({
  provider: { type: String, enum: ['paymongo'], default: 'paymongo' },
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  livemode: { type: Boolean, default: false },
  status: { type: String, enum: ['processed', 'ignored', 'failed'], default: 'processed' },
  error: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

// One row per landlord; webhook-authoritative.
const subscriptionSchema = new mongoose.Schema({
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  plan: { type: String, enum: ['starter', 'pro'], default: 'starter' },
  status: { type: String, enum: ['none', 'active', 'past_due', 'canceled'], default: 'none' },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  graceEndsAt: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
}, { timestamps: true });

// Checkout attempts and paid periods (billing history).
const subscriptionInvoiceSchema = new mongoose.Schema({
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: String, enum: ['pro'], required: true },
  amount: { type: Number, required: true }, // pesos
  checkoutSessionId: { type: String, required: true, unique: true },
  checkoutUrl: { type: String, default: '' },
  status: { type: String, enum: ['open', 'paid', 'expired', 'failed'], default: 'open' },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  providerPaymentId: { type: String, default: null },
}, { timestamps: true });

export const ProviderEvent = mongoose.model('ProviderEvent', providerEventSchema);
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export const SubscriptionInvoice = mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
