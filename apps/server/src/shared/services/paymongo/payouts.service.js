// Landlord payouts of rent collected through QR Ph.
//
// ⚠ NOT VERIFIED. PayMongo payouts/transfers need account activation, and the
// exact endpoint and payload depend on the product PayMongo enables for JPTL.
// Every provider call is in `submitTransferToProvider()`. Confirm it with
// PayMongo in test mode before setting PAYMONGO_PAYOUTS_ENABLED=true.
//
// Rules:
//   - only provider-confirmed QR Ph collections (RentCollection.status = 'paid') are payable
//   - each collection can be in at most one non-failed payout
//   - a payout is "paid" only when the provider reports it; starting one doesn't count
//   - a failed or reversed payout releases its collections to be paid out again
import crypto from 'crypto';
import mongoose from 'mongoose';
import AuditLog from '../../models/auditLog.model.js';
import { createNotification } from '../notification.service.js';
import { RentCollection } from './rentCollection.service.js';
import { assertFeature, paymongoRequest, toCentavos, PayMongoError } from './paymongo.client.js';

const accountSchema = new mongoose.Schema({
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  channel: { type: String, enum: ['bank', 'ewallet'], required: true },
  institutionCode: { type: String, required: true, trim: true, maxlength: 40 }, // provider bank/e-wallet code
  institutionName: { type: String, required: true, trim: true, maxlength: 120 },
  accountName: { type: String, required: true, trim: true, maxlength: 120 },
  accountNumberEnc: { type: String, required: true, select: false },
  accountNumberLast4: { type: String, required: true },
}, { timestamps: true });

const payoutSchema = new mongoose.Schema({
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true }, // pesos
  collections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RentCollection' }],
  idempotencyKey: { type: String, required: true, unique: true },
  providerReference: { type: String, default: null, index: true },
  status: { type: String, enum: ['requested', 'processing', 'paid', 'failed', 'reversed'], default: 'requested' },
  failureReason: { type: String, default: '' },
  destination: { institutionName: String, accountName: String, accountNumberLast4: String },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

export const LandlordPayoutAccount = mongoose.models.LandlordPayoutAccount || mongoose.model('LandlordPayoutAccount', accountSchema);
export const LandlordPayout = mongoose.models.LandlordPayout || mongoose.model('LandlordPayout', payoutSchema);

function key() {
  const base = process.env.PAYOUT_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!base) throw new PayMongoError('Payout encryption key is not configured.', 503);
  return crypto.createHash('sha256').update(`jptl-payout:${base}`).digest();
}
const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};
const decrypt = (payload) => {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
};

export async function getPayoutOverview(landlordId) {
  const [account, available, payouts] = await Promise.all([
    LandlordPayoutAccount.findOne({ landlord: landlordId }).lean(),
    RentCollection.find({ landlord: landlordId, status: 'paid', payout: null }).select('amount').lean(),
    LandlordPayout.find({ landlord: landlordId }).sort({ createdAt: -1 }).limit(24).lean(),
  ]);
  return {
    account: account ? { channel: account.channel, institutionName: account.institutionName, accountName: account.accountName, accountNumberLast4: account.accountNumberLast4 } : null,
    availableAmount: Math.round(available.reduce((s, c) => s + c.amount, 0) * 100) / 100,
    availableCount: available.length,
    payouts: payouts.map((p) => ({ id: p._id, amount: p.amount, status: p.status, failureReason: p.failureReason, createdAt: p.createdAt, completedAt: p.completedAt, destination: p.destination })),
  };
}

export async function savePayoutAccount(landlordId, body = {}) {
  const channel = body.channel;
  const accountNumber = String(body.accountNumber || '').replace(/\s+/g, '');
  if (!['bank', 'ewallet'].includes(channel)) throw new PayMongoError('Choose bank or e-wallet.', 400);
  if (!/^[0-9]{6,20}$/.test(accountNumber)) throw new PayMongoError('Enter a valid account or mobile number.', 400);
  for (const [field, max] of [['institutionCode', 40], ['institutionName', 120], ['accountName', 120]]) {
    if (!String(body[field] || '').trim() || String(body[field]).length > max) throw new PayMongoError(`Enter a valid ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}.`, 400);
  }
  await LandlordPayoutAccount.findOneAndUpdate(
    { landlord: landlordId },
    { landlord: landlordId, channel, institutionCode: body.institutionCode.trim(), institutionName: body.institutionName.trim(), accountName: body.accountName.trim(), accountNumberEnc: encrypt(accountNumber), accountNumberLast4: accountNumber.slice(-4) },
    { upsert: true, new: true }
  );
  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'PAYOUT_ACCOUNT_SAVED', entityKind: 'User', entityId: landlordId, afterState: { channel, institutionName: body.institutionName, last4: accountNumber.slice(-4) } }).catch(() => {});
  return getPayoutOverview(landlordId);
}

/** UNVERIFIED provider call. Adjust path/payload to PayMongo's payout product once confirmed. */
async function submitTransferToProvider(payout, account) {
  return paymongoRequest('POST', '/transfers', {
    amount: toCentavos(payout.amount),
    currency: 'PHP',
    reference_number: payout.idempotencyKey,
    description: 'JPTL rent payout',
    destination: {
      type: account.channel === 'bank' ? 'bank_account' : 'e_wallet',
      institution_code: account.institutionCode,
      account_name: account.accountName,
      account_number: decrypt(account.accountNumberEnc),
    },
  });
}

/** Request a payout of all available collections. */
export async function requestPayout(landlordId) {
  assertFeature('payouts');
  const account = await LandlordPayoutAccount.findOne({ landlord: landlordId }).select('+accountNumberEnc');
  if (!account) throw new PayMongoError('Add a payout account first.', 409);
  const idempotencyKey = `payout-${landlordId}-${crypto.randomUUID()}`;

  // Claim the collections atomically so two requests can't pay the same money twice.
  const payout = await LandlordPayout.create({ landlord: landlordId, amount: 0, idempotencyKey, destination: { institutionName: account.institutionName, accountName: account.accountName, accountNumberLast4: account.accountNumberLast4 } });
  await RentCollection.updateMany({ landlord: landlordId, status: 'paid', payout: null }, { $set: { payout: payout._id } });
  const claimed = await RentCollection.find({ payout: payout._id }).select('amount').lean();
  if (!claimed.length) {
    await LandlordPayout.deleteOne({ _id: payout._id });
    throw new PayMongoError('There is no collected rent to pay out yet.', 409);
  }
  payout.amount = Math.round(claimed.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  payout.collections = claimed.map((c) => c._id);
  await payout.save();

  try {
    const transfer = await submitTransferToProvider(payout, account);
    payout.providerReference = transfer?.id || null;
    payout.status = 'processing';
  } catch (error) {
    payout.status = 'failed';
    payout.failureReason = error.message;
    await RentCollection.updateMany({ payout: payout._id }, { $set: { payout: null } });
  }
  await payout.save();
  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'PAYOUT_REQUESTED', entityKind: 'User', entityId: landlordId, afterState: { payoutId: payout._id, amount: payout.amount, status: payout.status } }).catch(() => {});
  if (payout.status === 'failed') throw new PayMongoError(`Payout could not be started: ${payout.failureReason}`, 502);
  return getPayoutOverview(landlordId);
}

/** Webhook: provider status update for a payout. */
export async function handlePayoutStatus({ providerReference, status, reason = '' }) {
  const payout = await LandlordPayout.findOne({ providerReference });
  if (!payout) return { ignored: 'unknown_payout' };
  if (payout.status === status) return { ignored: 'no_change' };
  payout.status = status;
  if (status === 'paid') payout.completedAt = new Date();
  if (status === 'failed' || status === 'reversed') {
    payout.failureReason = reason;
    await RentCollection.updateMany({ payout: payout._id }, { $set: { payout: null } });
  }
  await payout.save();
  const titles = { paid: 'Payout sent', failed: 'Payout failed', reversed: 'Payout reversed' };
  if (titles[status]) await createNotification({ userId: payout.landlord, title: titles[status], body: `₱${payout.amount.toLocaleString()} to ${payout.destination?.institutionName || 'your account'} ••${payout.destination?.accountNumberLast4 || ''}${reason ? `: ${reason}` : ''}.`, type: 'payment' });
  return { processed: true };
}
