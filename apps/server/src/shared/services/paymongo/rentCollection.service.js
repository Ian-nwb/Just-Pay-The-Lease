// Tenant rent via PayMongo QR Ph (Payment Intent + qrph payment method).
//
// Money flow: funds settle to the JPTL PayMongo merchant account, not to the
// landlord. Landlords are paid separately (see payouts.service.js). Confirm this
// merchant arrangement with PayMongo before enabling PAYMONGO_QRPH_ENABLED.
//
// The invoice only counts as paid when PayMongo's `payment.paid` webhook arrives.
// Creating the QR, or the tenant saying they scanned it, never changes the balance.
import mongoose from 'mongoose';
import Payment from '../../models/payment.model.js';
import Property from '../../models/property.model.js';
import AuditLog from '../../models/auditLog.model.js';
import { createNotification } from '../notification.service.js';
import { sendPushToUsers } from '../pushNotification.service.js';
import { assertFeature, paymongoRequest, toCentavos, PayMongoError } from './paymongo.client.js';

const rentCollectionSchema = new mongoose.Schema({
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // pesos
  paymentIntentId: { type: String, required: true, unique: true },
  qrImageUrl: { type: String, default: '' },
  status: { type: String, enum: ['awaiting_payment', 'paid', 'failed', 'expired'], default: 'awaiting_payment' },
  providerPaymentId: { type: String, default: null, index: true },
  paidAt: { type: Date, default: null },
  // Set when this collection is included in a landlord payout.
  payout: { type: mongoose.Schema.Types.ObjectId, ref: 'LandlordPayout', default: null },
}, { timestamps: true });

export const RentCollection = mongoose.models.RentCollection || mongoose.model('RentCollection', rentCollectionSchema);

const QR_REUSE_MS = 25 * 60 * 1000;

/** Create (or reuse a recent) QR Ph code for the tenant's outstanding balance on one invoice. */
export async function createQrPhCharge(tenantId, paymentId) {
  assertFeature('qrph');
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new PayMongoError('Invalid invoice.', 400);
  const invoice = await Payment.findOne({ _id: paymentId, tenant: tenantId });
  if (!invoice) throw new PayMongoError('Invoice not found.', 404);
  if (!['pending', 'overdue', 'partially_paid'].includes(invoice.status)) throw new PayMongoError('This invoice is not open for payment.', 409);
  if (invoice.reviewStatus === 'pending_review') throw new PayMongoError('A payment for this invoice is already waiting for landlord review.', 409);
  const outstanding = Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount || 0));
  if (outstanding < 20) throw new PayMongoError('The remaining balance is below the online payment minimum.', 409);
  const property = await Property.findById(invoice.property).select('landlord name').lean();
  if (!property) throw new PayMongoError('Property not found.', 404);

  const recent = await RentCollection.findOne({ payment: invoice._id, status: 'awaiting_payment', amount: outstanding, createdAt: { $gte: new Date(Date.now() - QR_REUSE_MS) } }).lean();
  if (recent?.qrImageUrl) return { collectionId: recent._id, qrImageUrl: recent.qrImageUrl, amount: recent.amount };

  const intent = await paymongoRequest('POST', '/payment_intents', {
    amount: toCentavos(outstanding),
    currency: 'PHP',
    payment_method_allowed: ['qrph'],
    capture_type: 'automatic',
    description: `${invoice.period || 'Rent'} · ${property.name}`,
    metadata: { jptl_kind: 'rent', invoice_id: String(invoice._id), tenant_id: String(tenantId) },
  });
  const method = await paymongoRequest('POST', '/payment_methods', { type: 'qrph' });
  const attached = await paymongoRequest('POST', `/payment_intents/${intent.id}/attach`, { payment_method: method.id });
  const nextAction = attached?.attributes?.next_action || {};
  const qrImageUrl = nextAction.code?.image_url || nextAction.qr_code?.image_url || '';
  if (!qrImageUrl) throw new PayMongoError('PayMongo did not return a QR code. Try again later.', 502, nextAction);

  const collection = await RentCollection.create({ payment: invoice._id, tenant: tenantId, landlord: property.landlord, amount: outstanding, paymentIntentId: intent.id, qrImageUrl });
  await AuditLog.create({ actor: tenantId, actorRole: 'tenant', action: 'QRPH_CHARGE_CREATED', entityKind: 'Payment', entityId: invoice._id, afterState: { amount: outstanding, paymentIntentId: intent.id } }).catch(() => {});
  return { collectionId: collection._id, qrImageUrl, amount: outstanding };
}

/** Webhook: provider confirmed the QR Ph payment. Idempotent per payment intent. */
export async function handleRentPaid({ paymentIntentId, providerPaymentId, amountCentavos }) {
  const collection = await RentCollection.findOne({ paymentIntentId });
  if (!collection) return { ignored: 'unknown_intent' };
  if (collection.status === 'paid') return { ignored: 'already_paid' };
  const amount = Number(amountCentavos) / 100;
  if (Number.isFinite(amount) && Math.round(amount * 100) !== Math.round(collection.amount * 100)) {
    collection.status = 'failed';
    await collection.save();
    return { ignored: 'amount_mismatch' };
  }

  const invoice = await Payment.findById(collection.payment);
  if (!invoice) return { ignored: 'invoice_missing' };
  const already = invoice.paymentAllocations.some((a) => a.reference === providerPaymentId && !a.reversedAt);
  if (!already) {
    // Cap at the balance in case a manual payment was confirmed meanwhile; any excess shows in the audit for refund.
    const outstanding = Math.max(0, Number(invoice.amount) - Number(invoice.paidAmount || 0));
    const applied = Math.min(collection.amount, outstanding);
    if (applied > 0) {
      invoice.paymentAllocations.push({ amount: applied, channel: 'paymongo_qrph', confirmedAt: new Date(), confirmedBy: collection.landlord, reference: providerPaymentId || paymentIntentId, note: 'Confirmed by PayMongo webhook' });
    }
    invoice.paidAmount = Number(invoice.paidAmount || 0) + applied;
    invoice.status = invoice.paidAmount >= Number(invoice.amount) ? 'paid' : 'partially_paid';
    if (invoice.status === 'paid') invoice.paidAt = new Date();
    invoice.paymentChannel = 'paymongo_qrph';
    invoice.paymentMethod = 'QR Ph (PayMongo)';
    invoice.receiptNumber = invoice.receiptNumber || `RCP-${invoice._id.toString().slice(-8).toUpperCase()}`;
    await invoice.save();
    await AuditLog.create({ actor: collection.landlord, actorRole: 'landlord', action: 'QRPH_PAYMENT_CONFIRMED', entityKind: 'Payment', entityId: invoice._id, afterState: { applied, received: collection.amount, excess: collection.amount - applied, providerPaymentId } }).catch(() => {});
  }
  collection.status = 'paid';
  collection.paidAt = new Date();
  collection.providerPaymentId = providerPaymentId || null;
  await collection.save();

  const body = `₱${collection.amount.toLocaleString()} for ${invoice.period || 'rent'} was received through QR Ph.`;
  await createNotification({ userId: collection.tenant, title: 'Payment received', body, type: 'payment', refModel: 'Payment', refId: invoice._id });
  await createNotification({ userId: collection.landlord, title: 'QR Ph rent received', body, type: 'payment', refModel: 'Payment', refId: invoice._id });
  sendPushToUsers([collection.tenant], { title: 'Payment received', body, category: 'payments', url: '/tenant/payments' }).catch(() => {});
  return { processed: true };
}

export async function handleRentFailed({ paymentIntentId }) {
  const result = await RentCollection.updateOne({ paymentIntentId, status: 'awaiting_payment' }, { $set: { status: 'failed' } });
  return { processed: result.modifiedCount > 0 };
}

export async function getCollectionStatus(tenantId, collectionId) {
  if (!mongoose.Types.ObjectId.isValid(collectionId)) throw new PayMongoError('Invalid payment.', 400);
  const collection = await RentCollection.findOne({ _id: collectionId, tenant: tenantId }).select('status amount paidAt').lean();
  if (!collection) throw new PayMongoError('Payment not found.', 404);
  return collection;
}
