// Shared-meter utility billing: landlord enters the actual source bill, JPTL
// splits it across occupied units configured as `actual_bill`, the landlord
// reviews the draft, and posting creates one invoice per unit.
//
// Safeguards:
//   - one draft/posted bill per property + utility + month (unique index)
//   - one invoice per unit per bill (unique index on Payment)
//   - allocations always sum to the source total, to the centavo
//   - void keeps the record, and is refused once a tenant has paid against it
import mongoose from 'mongoose';
import UtilityBill from '../models/utilityBill.model.js';
import Payment from '../models/payment.model.js';
import Property from '../models/property.model.js';
import Unit from '../models/unit.model.js';
import AuditLog from '../models/auditLog.model.js';
import { createNotification } from './notification.service.js';
import { sendPushToUsers } from './pushNotification.service.js';
import { toPropertyCalendarDate } from '../utils/propertyDatePolicy.js';

const UTILITY_TYPES = ['electricity', 'water', 'gas', 'internet', 'other'];
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class UtilityBillError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const label = (type) => type.charAt(0).toUpperCase() + type.slice(1);
const periodName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const toCentavos = (value) => Math.round(Number(value) * 100);

/**
 * Split `total` by weights in whole centavos. Largest-remainder rounding keeps
 * the sum exactly equal to the total.
 */
export function splitAmount(total, weights) {
  const cents = toCentavos(total);
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!(sum > 0) || cents <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (cents * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = cents - floors.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder -= 1) floors[order[k][1]] += 1;
  return floors.map((c) => c / 100);
}

async function ownedProperty(landlordId, propertyId) {
  if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new UtilityBillError('Choose a valid property.');
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId }).select('name timezone status').lean();
  if (!property) throw new UtilityBillError('Property not found.', 404);
  return property;
}

async function billableUnits(propertyId, utilityType) {
  const units = await Unit.find({ property: propertyId, isActive: { $ne: false }, tenant: { $ne: null } }).select('label tenant utilityBilling').lean();
  return units
    .map((unit) => ({ unit, entry: (unit.utilityBilling || []).find((b) => b.utilityType === utilityType && b.billingMode === 'shared_meter' && b.chargeMode === 'actual_bill') }))
    .filter(({ entry }) => entry);
}

function formatBill(bill, propertyName = '') {
  const allocated = (bill.allocations || []).reduce((sum, a) => sum + toCentavos(a.amount), 0) / 100;
  return {
    id: bill._id,
    propertyId: bill.property,
    propertyName,
    utilityType: bill.utilityType,
    periodKey: bill.periodKey,
    periodName: periodName(bill.periodKey),
    totalAmount: bill.totalAmount,
    allocatedAmount: allocated,
    reconciled: toCentavos(allocated) === toCentavos(bill.totalAmount),
    sourceReference: bill.sourceReference,
    splitMethod: bill.splitMethod,
    dueDate: bill.dueDate,
    status: bill.status,
    allocations: (bill.allocations || []).map((a) => ({ id: a._id, unitId: a.unit, unitLabel: a.unitLabel, weight: a.weight, amount: a.amount, paymentId: a.payment })),
    history: (bill.history || []).map((h) => ({ action: h.action, at: h.at, note: h.note })),
    postedAt: bill.postedAt,
    voidedAt: bill.voidedAt,
    voidReason: bill.voidReason,
  };
}

/** Set how a property's shared utility is charged (fixed amount inside rent, or actual bills). */
export async function setUtilityChargeMode(landlordId, { propertyId, utilityType, chargeMode } = {}) {
  await ownedProperty(landlordId, propertyId);
  if (!UTILITY_TYPES.includes(utilityType)) throw new UtilityBillError('Choose a valid utility type.');
  if (!['fixed_in_rent', 'actual_bill'].includes(chargeMode)) throw new UtilityBillError('Choose a valid charge mode.');
  const units = await Unit.find({ property: propertyId, 'utilityBilling.utilityType': utilityType });
  let updated = 0;
  for (const unit of units) {
    for (const entry of unit.utilityBilling) {
      if (entry.utilityType === utilityType && entry.billingMode === 'shared_meter' && entry.chargeMode !== chargeMode) {
        entry.chargeMode = chargeMode;
        updated += 1;
      }
    }
    if (unit.isModified()) await unit.save();
  }
  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'UTILITY_CHARGE_MODE_SET', entityKind: 'Property', entityId: propertyId, afterState: { utilityType, chargeMode, updated } })
    .catch(() => {});
  return { updated };
}

/** Create a draft from a source bill and compute the split for review. */
export async function createDraftBill(landlordId, payload = {}) {
  const property = await ownedProperty(landlordId, payload.propertyId);
  if (property.status === 'inactive') throw new UtilityBillError('This property is inactive.', 409);
  const { utilityType, periodKey, splitMethod = 'equal' } = payload;
  if (!UTILITY_TYPES.includes(utilityType)) throw new UtilityBillError('Choose a valid utility type.');
  if (!PERIOD.test(String(periodKey || ''))) throw new UtilityBillError('Choose the billing month (YYYY-MM).');
  if (!['equal', 'by_share'].includes(splitMethod)) throw new UtilityBillError('Choose equal or by-share split.');
  const totalAmount = Number(payload.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount > 10_000_000) throw new UtilityBillError('Enter the source bill total.');
  if (toCentavos(totalAmount) / 100 !== Number(totalAmount.toFixed(2))) throw new UtilityBillError('Use at most two decimal places.');
  const dueDate = toPropertyCalendarDate(payload.dueDate, property.timezone || 'Asia/Manila');
  if (!dueDate) throw new UtilityBillError('Enter a valid due date.');
  const sourceReference = String(payload.sourceReference || '').trim().slice(0, 120);

  const units = await billableUnits(property._id, utilityType);
  if (!units.length) throw new UtilityBillError('No occupied units at this property are set to bill this utility from actual bills.', 409);
  const weights = units.map(({ entry }) => (splitMethod === 'by_share' ? Math.max(0, Number(entry.monthlyShare || 0)) : 1));
  if (splitMethod === 'by_share' && !weights.some((w) => w > 0)) throw new UtilityBillError('By-share split needs a positive share on at least one unit.', 409);
  const amounts = splitAmount(totalAmount, weights);

  try {
    const bill = await UtilityBill.create({
      landlord: landlordId, property: property._id, utilityType, periodKey, totalAmount, sourceReference, splitMethod, dueDate,
      allocations: units.map(({ unit }, i) => ({ unit: unit._id, tenant: unit.tenant, unitLabel: unit.label, weight: weights[i], amount: amounts[i] })),
      history: [{ action: 'created', by: landlordId, at: new Date(), note: sourceReference }],
    });
    return formatBill(bill.toObject(), property.name);
  } catch (error) {
    if (error.code === 11000) throw new UtilityBillError(`A ${utilityType} bill for ${periodName(periodKey)} already exists for this property. Void it first to replace it.`, 409);
    throw error;
  }
}

export async function listBills(landlordId, { propertyId } = {}) {
  const filter = { landlord: landlordId };
  if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) filter.property = propertyId;
  const [bills, properties] = await Promise.all([
    UtilityBill.find(filter).sort({ periodKey: -1, createdAt: -1 }).limit(100).lean(),
    Property.find({ landlord: landlordId }).select('name').lean(),
  ]);
  const names = new Map(properties.map((p) => [String(p._id), p.name]));
  return bills.map((bill) => formatBill(bill, names.get(String(bill.property))));
}

/** Post a reviewed draft: one invoice per allocation. Safe to retry. */
export async function postBill(landlordId, billId) {
  const bill = await UtilityBill.findOne({ _id: billId, landlord: landlordId });
  if (!bill) throw new UtilityBillError('Utility bill not found.', 404);
  if (bill.status === 'void') throw new UtilityBillError('This bill was voided.', 409);
  const allocated = bill.allocations.reduce((sum, a) => sum + toCentavos(a.amount), 0);
  if (allocated !== toCentavos(bill.totalAmount)) throw new UtilityBillError('Allocations do not add up to the bill total.', 409);
  const property = await Property.findById(bill.property).select('name').lean();
  const period = `${label(bill.utilityType)} bill · ${periodName(bill.periodKey)}`;

  for (const allocation of bill.allocations) {
    if (allocation.payment || allocation.amount <= 0) continue;
    let invoice;
    try {
      invoice = await Payment.create({
        tenant: allocation.tenant, unit: allocation.unit, property: bill.property,
        amount: allocation.amount, baseRent: 0, parkingFee: 0, utilityFee: allocation.amount,
        chargeType: 'utility', utilityBill: bill._id,
        dueDate: bill.dueDate, status: 'pending', period,
        notes: bill.sourceReference ? `Source bill ${bill.sourceReference}` : '',
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      invoice = await Payment.findOne({ utilityBill: bill._id, unit: allocation.unit }).select('_id').lean(); // already posted by an earlier attempt
    }
    allocation.payment = invoice._id;
    await createNotification({ userId: allocation.tenant, title: `${period} posted`, body: `₱${Number(allocation.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} for ${allocation.unitLabel || 'your unit'} at ${property?.name || 'your property'}.`, type: 'payment', refModel: 'Payment', refId: invoice._id });
    sendPushToUsers([allocation.tenant], { title: `${period} posted`, body: `₱${Number(allocation.amount).toLocaleString()} is due.`, category: 'payments', url: '/tenant/payments' }).catch(() => {});
  }
  if (bill.status !== 'posted') {
    bill.status = 'posted';
    bill.postedAt = new Date();
    bill.history.push({ action: 'posted', by: landlordId, at: bill.postedAt });
  }
  await bill.save();
  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'UTILITY_BILL_POSTED', entityKind: 'UtilityBill', entityId: bill._id, afterState: { total: bill.totalAmount, invoices: bill.allocations.length } }).catch(() => {});
  return formatBill(bill.toObject(), property?.name);
}

/** Change a draft allocation by hand (e.g. a unit was vacant half the month). Total must still reconcile before posting. */
export async function adjustDraftAllocation(landlordId, billId, allocationId, { amount, note } = {}) {
  const bill = await UtilityBill.findOne({ _id: billId, landlord: landlordId });
  if (!bill) throw new UtilityBillError('Utility bill not found.', 404);
  if (bill.status !== 'draft') throw new UtilityBillError('Only draft bills can be adjusted. Void a posted bill and re-enter it instead.', 409);
  const allocation = bill.allocations.id(allocationId);
  if (!allocation) throw new UtilityBillError('Allocation not found.', 404);
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0 || toCentavos(value) / 100 !== Number(value.toFixed(2))) throw new UtilityBillError('Enter a valid amount.');
  const reason = String(note || '').trim();
  if (!reason) throw new UtilityBillError('Give a reason for the adjustment.');
  bill.history.push({ action: 'adjusted', by: landlordId, at: new Date(), note: `${allocation.unitLabel}: ₱${allocation.amount} → ₱${value}. ${reason}`.slice(0, 500) });
  allocation.amount = value;
  await bill.save();
  return formatBill(bill.toObject());
}

/** Void a bill. Unpaid invoices it created are removed; any payment activity blocks the void. */
export async function voidBill(landlordId, billId, { reason } = {}) {
  const note = String(reason || '').trim();
  if (!note) throw new UtilityBillError('Give a reason for voiding this bill.');
  const bill = await UtilityBill.findOne({ _id: billId, landlord: landlordId });
  if (!bill) throw new UtilityBillError('Utility bill not found.', 404);
  if (bill.status === 'void') return formatBill(bill.toObject());
  const invoices = await Payment.find({ utilityBill: bill._id });
  const active = invoices.filter((p) => (p.paymentAllocations || []).length || Number(p.paidAmount || 0) > 0 || p.reviewStatus === 'pending_review' || p.status === 'paid');
  if (active.length) throw new UtilityBillError(`${active.length} invoice${active.length > 1 ? 's have' : ' has'} payment activity. Reverse those payments before voiding.`, 409);
  await Payment.deleteMany({ _id: { $in: invoices.map((p) => p._id) } });
  for (const allocation of bill.allocations) {
    if (allocation.payment) {
      await createNotification({ userId: allocation.tenant, title: `${label(bill.utilityType)} bill withdrawn`, body: `The ${periodName(bill.periodKey)} ${bill.utilityType} bill was withdrawn by your landlord: ${note}`, type: 'payment' });
    }
    allocation.payment = null;
  }
  bill.status = 'void';
  bill.voidedAt = new Date();
  bill.voidReason = note.slice(0, 500);
  bill.history.push({ action: 'voided', by: landlordId, at: bill.voidedAt, note: bill.voidReason });
  await bill.save();
  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'UTILITY_BILL_VOIDED', entityKind: 'UtilityBill', entityId: bill._id, beforeState: { invoices: invoices.map((p) => ({ id: p._id, amount: p.amount })) }, afterState: { reason: note } }).catch(() => {});
  return formatBill(bill.toObject());
}
