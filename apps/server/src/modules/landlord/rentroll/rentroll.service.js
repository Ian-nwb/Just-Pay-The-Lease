import mongoose from 'mongoose';
import Property from '../../../shared/models/property.model.js';
import Unit from '../../../shared/models/unit.model.js';
import User from '../../../shared/models/user.model.js';
import Payment from '../../../shared/models/payment.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import { parseCalendarDate, propertyToday, toPropertyCalendarDate } from '../../../shared/utils/propertyDatePolicy.js';
import { sendPushToUsers } from '../../../shared/services/pushNotification.service.js';

class RentRollError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Helper to get all unit IDs belonging to a landlord
 */
async function getLandlordUnitIds(landlordId, context = {}) {
  if (context.propertyIds && context.unitIds) return context;
  const properties = await Property.find({ landlord: landlordId }).select('_id').lean();
  const propertyIds = properties.map((p) => p._id);
  const units = await Unit.find({ property: { $in: propertyIds } }).select('_id property label monthlyRent tenant').lean();
  return { propertyIds, units, unitIds: units.map((u) => u._id) };
}

function visiblePaymentScope(unitIds, propertyIds) {
  return { $and: [
    { $or: [{ unit: { $in: unitIds } }, { property: { $in: propertyIds } }] },
    { status: { $ne: 'draft' } },
    { $or: [{ isAdvancePayment: { $ne: true } }, { status: 'paid' }, { submittedAt: { $ne: null } }] },
  ] };
}

function withPropertyDueStatus(payment) {
  const property = payment.property && typeof payment.property === 'object' ? payment.property : payment.unit?.property;
  const today = propertyToday(new Date(), property?.timezone || 'Asia/Manila');
  const dueDate = parseCalendarDate(payment.dueDate, property?.timezone || 'Asia/Manila');
  const isOverdue = ['pending', 'partially_paid', 'overdue'].includes(payment.status) && Boolean(today && dueDate && dueDate < today);
  return { ...payment, isOverdue, status: payment.status === 'pending' && isOverdue ? 'overdue' : payment.status };
}

/**
 * Format a single payment object for client response
 */
function formatPayment(p) {
  p = withPropertyDueStatus(p);
  const tenantObj = p.tenant || null;
  const unitObj = p.unit || null;
  const propObj = p.property || unitObj?.property || null;

  const tenantName = tenantObj
    ? [tenantObj.firstName, tenantObj.middleName, tenantObj.lastName].filter(Boolean).join(' ')
    : 'Unknown Tenant';

  const propertyName = typeof propObj === 'object' && propObj?.name
    ? propObj.name
    : 'Unknown Property';

  const unitLabel = typeof unitObj === 'object' && unitObj?.label
    ? unitObj.label
    : 'Unknown Unit';

  return {
    id: p._id,
    paymentId: p._id,
    amount: p.amount,
    paidAmount: Number(p.paidAmount || (p.status === 'paid' ? p.amount : 0)),
    outstandingBalance: Math.max(0, Number(p.amount || 0) - Number(p.paidAmount || (p.status === 'paid' ? p.amount : 0))),
    submittedAmount: p.submittedAmount ?? null,
    paymentAllocations: (p.paymentAllocations || []).map((allocation) => ({
      id: allocation._id,
      amount: Number(allocation.amount || 0), channel: allocation.channel,
      confirmedAt: allocation.confirmedAt, reference: allocation.reference || '', note: allocation.note || '',
      reversedAt: allocation.reversedAt || null, reversalReason: allocation.reversalReason || '',
    })),
    corrections: (p.corrections || []).map((c) => ({ field: c.field, from: c.from, to: c.to, reason: c.reason, correctedAt: c.correctedAt })),
    baseRent: p.baseRent ?? p.amount,
    parkingFee: p.parkingFee ?? 0,
    utilityFee: p.utilityFee ?? 0,
    processingFee: p.processingFee ?? 0,
    dueDate: p.dueDate,
    status: p.status,
    isOverdue: Boolean(p.isOverdue || p.status === 'overdue'),
    reviewStatus: p.reviewStatus || null,
    paymentChannel: p.paymentChannel || null,
    submittedAt: p.submittedAt || null,
    transferReference: p.transferReference || '',
    tenantPaymentNote: p.tenantPaymentNote || '',
    rejectionReason: p.rejectionReason || '',
    hasReceipt: Boolean(p.receiptPublicId),
    period: p.period || `Rent Due ${p.dueDate ? new Date(p.dueDate).toISOString().slice(0, 7) : 'Current'}`,
    paymentMethod: p.paymentMethod || null,
    mockTransactionId: p.mockTransactionId || null,
    paidAt: p.paidAt || null,
    notes: p.notes || '',
    tenant: tenantObj
      ? {
          id: tenantObj._id,
          firstName: tenantObj.firstName,
          lastName: tenantObj.lastName,
          name: tenantName,
          email: tenantObj.email,
          phone: tenantObj.preferences?.privacy?.showPhoneToLandlord === false ? '' : (tenantObj.phone || ''),
        }
      : null,
    tenantName,
    tenantEmail: tenantObj?.email || '',
    unit: unitObj
      ? {
          id: unitObj._id,
          label: unitObj.label,
          monthlyRent: unitObj.monthlyRent,
        }
      : null,
    unitLabel,
    property: propObj
      ? {
          id: propObj._id,
          name: propertyName,
          address: propObj.address || '',
          city: propObj.city || '',
        }
      : null,
    propertyName,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * GET /api/landlord/rentroll
 * Query rent roll with search, status filters, property/unit filters, and summary metrics.
 */
export async function getRentRoll(landlordId, query = {}, context = {}) {
  const { propertyIds, unitIds, units } = (context.propertyIds && context.unitIds && context.units)
    ? context
    : await getLandlordUnitIds(landlordId);

  if (!unitIds.length) {
    return {
      summary: {
        totalCollected: 0,
        totalPending: 0,
        totalOverdue: 0,
        totalExpected: 0,
        totalCount: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
        collectionRate: 0,
      },
      payments: [],
    };
  }

  // Base match filter scoped to landlord's units and properties
  const baseLandlordScope = visiblePaymentScope(unitIds, propertyIds);

  const filter = { $and: [...baseLandlordScope.$and] };

  // Status filter ('all', 'paid', 'pending', 'overdue', 'failed')
  if (query.status && query.status !== 'all') {
    if (query.status === 'pending_review') filter.$and.push({ reviewStatus: 'pending_review' });
    else filter.$and.push({ status: query.status });
  }

  // Specific property filter
  if (query.propertyId) {
    filter.$and.push({ property: query.propertyId });
  }

  // Specific unit filter
  if (query.unitId) {
    filter.$and.push({ unit: query.unitId });
  }

  // Date range filter on dueDate
  if (query.startDate || query.endDate) {
    filter.dueDate = {};
    if (query.startDate) filter.dueDate.$gte = new Date(query.startDate);
    if (query.endDate) filter.dueDate.$lte = new Date(query.endDate);
  }

  // Fetch all payments for this landlord to compute summary metrics
  const [allLandlordPayments, matchedPayments] = await Promise.all([
    Payment.find(baseLandlordScope).populate('property', 'timezone').populate({ path: 'unit', select: 'property', populate: { path: 'property', select: 'timezone' } }).lean(),
    Payment.find(filter)
      .populate('tenant', 'firstName middleName lastName email phone preferences')
      .populate({
        path: 'unit',
        select: 'label property monthlyRent',
        populate: { path: 'property', select: 'name address city timezone' },
      })
      .populate('property', 'name address city timezone')
      .sort({ dueDate: -1, createdAt: -1 })
      .lean(),
  ]);

  const dueStatePayments = allLandlordPayments.map(withPropertyDueStatus);
  // Compute summary on all landlord payments using the property's calendar date.
  const totalCollected = dueStatePayments
    .reduce((sum, p) => sum + Number(p.paidAmount || (p.status === 'paid' ? p.amount : 0)), 0);

  const totalPending = dueStatePayments
    .filter((p) => ['pending', 'partially_paid', 'overdue'].includes(p.status))
    .reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0) - Number(p.paidAmount || 0)), 0);

  const totalOverdue = dueStatePayments
    .filter((p) => p.status === 'overdue' || p.isOverdue)
    .reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0) - Number(p.paidAmount || 0)), 0);

  const totalExpected = dueStatePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paidCount = dueStatePayments.filter((p) => p.status === 'paid').length;
  const pendingCount = dueStatePayments.filter((p) => p.status === 'pending').length;
  const overdueCount = dueStatePayments.filter((p) => p.status === 'overdue' || p.isOverdue).length;
  const partiallyPaidCount = dueStatePayments.filter((p) => p.status === 'partially_paid').length;
  const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  // Format matched payments
  let formatted = matchedPayments.map(formatPayment);

  // Apply search query filter (in memory across tenant name, email, property name, unit label, transaction ID)
  if (query.search && query.search.trim()) {
    const q = query.search.trim().toLowerCase();
    formatted = formatted.filter((p) => {
      return (
        p.tenantName.toLowerCase().includes(q) ||
        p.tenantEmail.toLowerCase().includes(q) ||
        p.propertyName.toLowerCase().includes(q) ||
        p.unitLabel.toLowerCase().includes(q) ||
        (p.mockTransactionId && p.mockTransactionId.toLowerCase().includes(q)) ||
        (p.period && p.period.toLowerCase().includes(q))
      );
    });
  }

  return {
    summary: {
      totalCollected,
      totalPending,
      totalOverdue,
      totalExpected,
      totalCount: allLandlordPayments.length,
      paidCount,
      pendingCount,
      overdueCount,
      partiallyPaidCount,
      collectionRate,
    },
    payments: formatted,
  };
}

/**
 * GET /api/landlord/rentroll/kpi
 * Quick financial summary KPI snapshot for rent roll
 */
export async function getRentRollKpi(landlordId) {
  const result = await getRentRoll(landlordId, {});
  return result.summary;
}

/**
 * GET /api/landlord/rentroll/:id
 * Retrieve a single payment invoice detail
 */
export async function getPaymentById(landlordId, paymentId, context = {}) {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw new RentRollError('Invalid payment ID format', 400);
  }

  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId, context);

  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) })
    .populate('tenant', 'firstName middleName lastName email phone preferences')
    .populate({
      path: 'unit',
      select: 'label property monthlyRent bedrooms bathrooms sqft',
      populate: { path: 'property', select: 'name address city image' },
    })
    .populate('property', 'name address city image')
    .lean();

  if (!payment) {
    throw new RentRollError('Payment record not found or access denied', 404);
  }

  return formatPayment(payment);
}

/**
 * POST /api/landlord/rentroll
 * Create a new payment invoice / charge for a tenant
 */
export async function createPaymentInvoice(landlordId, data, ipAddress = '') {
  const { unitId, tenantId, amount, dueDate, period, baseRent, parkingFee, utilityFee, notes, status } = data;

  if (!unitId || !mongoose.Types.ObjectId.isValid(unitId)) {
    throw new RentRollError('Valid unitId is required', 400);
  }
  if (status === 'draft') throw new RentRollError('Draft invoices are reserved for tenant advance payment preparation.', 400);
  if (status === 'paid') throw new RentRollError('Invoices must be approved through payment review before they can be marked paid', 400);

  // Validate unit belongs to landlord
  const unit = await Unit.findById(unitId).populate('property').lean();
  if (!unit || unit.property.landlord.toString() !== landlordId.toString()) {
    throw new RentRollError('Unit does not belong to your managed properties', 403);
  }

  // Resolve tenant
  let targetTenantId = tenantId;
  if (!targetTenantId) {
    if (!unit.tenant) {
      throw new RentRollError('No tenant is assigned to this unit. Provide tenantId explicitly', 400);
    }
    targetTenantId = unit.tenant;
  }

  const tenant = await User.findById(targetTenantId).lean();
  if (!tenant) {
    throw new RentRollError('Tenant user record not found', 404);
  }

  const calculatedBase = baseRent !== undefined ? Number(baseRent) : (unit.monthlyRent || 0);
  const calculatedParking = parkingFee !== undefined ? Number(parkingFee) : 0;
  const calculatedUtility = utilityFee !== undefined ? Number(utilityFee) : 0;
  const totalAmount = amount !== undefined ? Number(amount) : calculatedBase + calculatedParking + calculatedUtility;

  if (isNaN(totalAmount) || totalAmount <= 0) {
    throw new RentRollError('Amount must be a positive number', 400);
  }

  // Due dates are property calendar dates; default is "today" at the property.
  const timezone = unit.property?.timezone || 'Asia/Manila';
  const parsedDueDate = toPropertyCalendarDate(dueDate || propertyToday(new Date(), timezone), timezone);
  if (!parsedDueDate) {
    throw new RentRollError('Invalid dueDate format', 400);
  }
  // A new invoice can never start as paid; payments are recorded through review.
  if (status !== undefined && !['pending', 'draft'].includes(status)) {
    throw new RentRollError('A new invoice must start as pending or draft.', 400);
  }

  const payment = new Payment({
    tenant: targetTenantId,
    unit: unitId,
    property: unit.property._id,
    amount: totalAmount,
    baseRent: calculatedBase,
    parkingFee: calculatedParking,
    utilityFee: calculatedUtility,
    dueDate: parsedDueDate,
    status: status || 'pending',
    period: period || `Rent Due ${parsedDueDate.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
    notes: notes || '',
  });

  await payment.save();

  // Audit log
  await AuditLog.create({
    actor: landlordId,
    actorRole: 'landlord',
    action: 'PAYMENT_INVOICE_CREATED',
    entityKind: 'Payment',
    entityId: payment._id,
    ipAddress,
  });

  return getPaymentById(landlordId, payment._id);
}

/**
 * PATCH /api/landlord/rentroll/:id/mark-paid
 * Mark a payment invoice as paid (used by "Mark Paid" button in PaymentsTab)
 */
export async function markPaymentAsPaid(landlordId, paymentId, data = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw new RentRollError('Invalid payment ID format', 400);
  }

  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId);

  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) });
  if (!payment) {
    throw new RentRollError('Payment record not found or access denied', 404);
  }

  if (payment.reviewStatus !== 'pending_review' || payment.paymentChannel !== 'onsite') {
    throw new RentRollError('Only an onsite payment awaiting review can be confirmed here', 409);
  }
  return reviewPayment(landlordId, paymentId, { action: 'approve', notes: data.notes }, ipAddress);
}

export async function reviewPayment(landlordId, paymentId, data = {}, ipAddress = '', context = {}) {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new RentRollError('Invalid payment ID format', 400);
  const action = data.action;
  if (!['approve', 'reject'].includes(action)) throw new RentRollError('Action must be approve or reject', 400);
  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId, context);
  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) });
  if (!payment) throw new RentRollError('Payment record not found or access denied', 404);
  if (payment.reviewStatus !== 'pending_review') throw new RentRollError('Payment is not awaiting review', 409);
  if (action === 'approve' && payment.paymentChannel !== 'onsite' && !payment.receiptPublicId) throw new RentRollError('Transfer receipt is required before approval', 409);
  if (action === 'reject' && !String(data.reason || '').trim()) throw new RentRollError('A rejection reason is required', 400);

  payment.reviewStatus = action === 'approve' ? 'approved' : 'rejected';
  payment.reviewedAt = new Date();
  payment.reviewedBy = landlordId;
  if (action === 'approve') {
    const alreadyPaid = Number(payment.paidAmount || (payment.status === 'paid' ? payment.amount : 0));
    const allocation = Number(payment.submittedAmount || Math.max(0, Number(payment.amount) - alreadyPaid));
    const balance = Math.max(0, Number(payment.amount) - alreadyPaid);
    if (!Number.isFinite(allocation) || allocation <= 0 || allocation > balance) throw new RentRollError('Submitted amount is invalid or exceeds the outstanding balance', 409);
    payment.paymentAllocations.push({
      amount: allocation,
      channel: payment.paymentChannel,
      confirmedAt: payment.reviewedAt,
      confirmedBy: landlordId,
      reference: payment.transferReference || '',
      note: payment.tenantPaymentNote || '',
    });
    payment.paidAmount = alreadyPaid + allocation;
    payment.status = payment.paidAmount >= Number(payment.amount) ? 'paid' : 'partially_paid';
    if (payment.status === 'paid') payment.paidAt = payment.reviewedAt;
    payment.receiptNumber = payment.receiptNumber || `RCP-${payment._id.toString().slice(-8).toUpperCase()}`;
    payment.rejectionReason = '';
    payment.paymentMethod = payment.paymentOptionSnapshot?.displayName || (payment.paymentChannel === 'onsite' ? 'Pay Onsite' : 'Bank Transfer');
  } else {
    payment.rejectionReason = String(data.reason).trim().slice(0, 1000);
  }
  if (data.notes) payment.notes = String(data.notes).trim().slice(0, 1000);
  await payment.save();
  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: action === 'approve' ? 'PAYMENT_REVIEW_APPROVED' : 'PAYMENT_REVIEW_REJECTED', entityKind: 'Payment', entityId: payment._id, afterState: { reviewStatus: payment.reviewStatus, reason: payment.rejectionReason }, ipAddress });
  if (payment.tenant) {
    const { createNotification } = await import('../../../shared/services/notification.service.js');
    const title = action === 'approve' ? (payment.status === 'paid' ? 'Rent paid' : 'Partial rent payment confirmed') : 'Payment needs attention';
    const body = action === 'approve' ? `₱${Number(payment.submittedAmount || 0).toLocaleString()} was confirmed for ${payment.period || 'rent'}. Outstanding balance: ₱${Math.max(0, Number(payment.amount) - Number(payment.paidAmount || 0)).toLocaleString()}.` : `Your payment for ${payment.period || 'rent'} was declined: ${payment.rejectionReason}`;
    await createNotification({ userId: payment.tenant, title, body, type: 'payment', refModel: 'Payment', refId: payment._id });
    sendPushToUsers([payment.tenant], { title, body, category: 'payments', url: '/tenant/payments' }).catch((error) => console.error('Payment push dispatch error:', error.message));
  }
  return getPaymentById(landlordId, payment._id, context);
}

export async function getLandlordPaymentEvidence(landlordId, paymentId, context = {}) {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new RentRollError('Invalid payment ID format', 400);
  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId, context);
  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) }).lean();
  if (!payment?.receiptPublicId) throw new RentRollError('Payment evidence not found', 404);
  const { getPrivatePaymentAssetUrl } = await import('../../../shared/config/cloudinary.js');
  const format = payment.receiptFormat;
  const url = await getPrivatePaymentAssetUrl(payment.receiptPublicId, format, format === 'pdf' ? 'raw' : 'image');
  if (!url) throw new RentRollError('Payment evidence storage is unavailable', 404);
  const response = await fetch(url);
  if (!response.ok) throw new RentRollError('Payment evidence could not be loaded', 502);
  return { stream: response.body, name: payment.receiptOriginalName || 'payment-receipt', mimeType: response.headers.get('content-type') || 'application/octet-stream' };
}

/** Sum of confirmed, non-reversed allocations; legacy paid invoices without allocations count in full. */
function confirmedPaidAmount(payment) {
  const allocations = payment.paymentAllocations || [];
  if (!allocations.length) return Number(payment.paidAmount || (payment.status === 'paid' ? payment.amount : 0));
  return allocations.filter((a) => !a.reversedAt).reduce((sum, a) => sum + Number(a.amount || 0), 0);
}

function applyPaidStatus(payment, paid) {
  payment.paidAmount = paid;
  if (paid >= Number(payment.amount)) {
    payment.status = 'paid';
    payment.paidAt = payment.paidAt || new Date();
  } else {
    payment.status = paid > 0 ? 'partially_paid' : 'pending';
    payment.paidAt = null;
  }
}

/**
 * PATCH /api/landlord/rentroll/:id/allocations/:allocationId/reverse
 * Reverse a confirmed payment (e.g. a bounced transfer). The allocation stays on record.
 */
export async function reversePaymentAllocation(landlordId, paymentId, allocationId, data = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(paymentId) || !mongoose.Types.ObjectId.isValid(allocationId)) throw new RentRollError('Invalid ID format', 400);
  const reason = String(data.reason || '').trim();
  if (!reason) throw new RentRollError('Give a reason for reversing this payment.', 400);
  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId);
  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) });
  if (!payment) throw new RentRollError('Payment record not found or access denied', 404);
  const allocation = payment.paymentAllocations.id(allocationId);
  if (!allocation) throw new RentRollError('Payment allocation not found', 404);
  if (allocation.reversedAt) throw new RentRollError('This payment was already reversed', 409);

  const before = { paidAmount: payment.paidAmount, status: payment.status };
  allocation.reversedAt = new Date();
  allocation.reversedBy = landlordId;
  allocation.reversalReason = reason.slice(0, 500);
  applyPaidStatus(payment, confirmedPaidAmount(payment));
  await payment.save();

  await AuditLog.create({
    actor: landlordId, actorRole: 'landlord', action: 'PAYMENT_ALLOCATION_REVERSED', entityKind: 'Payment', entityId: payment._id,
    beforeState: before, afterState: { paidAmount: payment.paidAmount, status: payment.status, allocationId, amount: allocation.amount, reason }, ipAddress,
  });
  if (payment.tenant) {
    const { createNotification } = await import('../../../shared/services/notification.service.js');
    const outstanding = Math.max(0, Number(payment.amount) - Number(payment.paidAmount || 0));
    const title = 'Payment reversed';
    const body = `A ₱${Number(allocation.amount).toLocaleString()} payment on ${payment.period || 'rent'} was reversed: ${reason}. Outstanding balance: ₱${outstanding.toLocaleString()}.`;
    await createNotification({ userId: payment.tenant, title, body, type: 'payment', refModel: 'Payment', refId: payment._id });
    sendPushToUsers([payment.tenant], { title, body, category: 'payments', url: '/tenant/payments' }).catch(() => {});
  }
  return getPaymentById(landlordId, payment._id);
}

/**
 * PUT /api/landlord/rentroll/:id
 * Update an existing payment record
 */
export async function updatePayment(landlordId, paymentId, data = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw new RentRollError('Invalid payment ID format', 400);
  }

  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId);

  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) });
  if (!payment) {
    throw new RentRollError('Payment record not found or access denied', 404);
  }

  const beforeState = payment.toObject();
  const reason = String(data.correctionReason || '').trim();
  const now = new Date();
  const confirmedPaid = confirmedPaidAmount(payment);

  if (data.amount !== undefined && Number(data.amount) !== Number(payment.amount)) {
    const amt = Number(data.amount);
    if (!Number.isFinite(amt) || amt <= 0) throw new RentRollError('Amount must be a positive number', 400);
    if (amt < confirmedPaid) throw new RentRollError(`Amount cannot be lower than the ₱${confirmedPaid.toLocaleString()} already confirmed. Reverse a payment first if it was recorded in error.`, 409);
    if (!reason) throw new RentRollError('Give a reason for changing the billed amount.', 400);
    payment.corrections.push({ field: 'amount', from: payment.amount, to: amt, reason: reason.slice(0, 500), correctedBy: landlordId, correctedAt: now });
    payment.amount = amt;
  }

  if (data.dueDate !== undefined) {
    const property = payment.property ? await Property.findById(payment.property).select('timezone').lean() : null;
    const due = toPropertyCalendarDate(data.dueDate, property?.timezone || 'Asia/Manila');
    if (!due) throw new RentRollError('Enter a valid due date', 400);
    if (due.getTime() !== new Date(payment.dueDate).getTime()) {
      if (!reason) throw new RentRollError('Give a reason for changing the due date.', 400);
      payment.corrections.push({ field: 'dueDate', from: payment.dueDate, to: due, reason: reason.slice(0, 500), correctedBy: landlordId, correctedAt: now });
      payment.dueDate = due;
    }
  }

  // Status follows confirmed payments; only an unpaid invoice can be marked failed or reopened.
  if (data.status !== undefined) {
    if (!['pending', 'failed'].includes(data.status)) throw new RentRollError('Status can only be set to pending or failed. Paid and partially paid follow confirmed payments.', 400);
    if (confirmedPaid > 0) throw new RentRollError('This invoice has confirmed payments, so its status follows those payments.', 409);
    payment.status = data.status;
  }
  if (payment.status !== 'failed' && (confirmedPaid > 0 || payment.status === 'paid' || payment.status === 'partially_paid')) {
    applyPaidStatus(payment, confirmedPaid);
  }

  if (data.period !== undefined) payment.period = data.period;
  if (data.paymentMethod !== undefined) payment.paymentMethod = data.paymentMethod;
  if (data.notes !== undefined) payment.notes = data.notes;
  if (data.baseRent !== undefined) payment.baseRent = Number(data.baseRent);
  if (data.parkingFee !== undefined) payment.parkingFee = Number(data.parkingFee);
  if (data.utilityFee !== undefined) payment.utilityFee = Number(data.utilityFee);

  await payment.save();

  // Audit log
  await AuditLog.create({
    actor: landlordId,
    actorRole: 'landlord',
    action: 'PAYMENT_UPDATED',
    entityKind: 'Payment',
    entityId: payment._id,
    beforeState: { amount: beforeState.amount, dueDate: beforeState.dueDate, status: beforeState.status, paidAmount: beforeState.paidAmount },
    afterState: { amount: payment.amount, dueDate: payment.dueDate, status: payment.status, paidAmount: payment.paidAmount, reason },
    ipAddress,
  });

  return getPaymentById(landlordId, payment._id);
}

/**
 * DELETE /api/landlord/rentroll/:id
 * Delete / void a payment record
 */
export async function deletePayment(landlordId, paymentId, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    throw new RentRollError('Invalid payment ID format', 400);
  }

  const { propertyIds, unitIds } = await getLandlordUnitIds(landlordId);

  const payment = await Payment.findOne({ _id: paymentId, ...visiblePaymentScope(unitIds, propertyIds) });
  if (!payment) {
    throw new RentRollError('Payment record not found or access denied', 404);
  }

  // Never erase money history: an invoice with any recorded payment (even a reversed one),
  // or a submission awaiting review, must be corrected instead of deleted.
  if ((payment.paymentAllocations || []).length > 0 || Number(payment.paidAmount || 0) > 0 || payment.status === 'paid' || payment.reviewStatus === 'pending_review') {
    throw new RentRollError('This invoice has payment activity. Reverse or correct it instead of deleting it.', 409);
  }

  await Payment.deleteOne({ _id: paymentId });

  // Audit log
  await AuditLog.create({
    actor: landlordId,
    actorRole: 'landlord',
    action: 'PAYMENT_DELETED',
    entityKind: 'Payment',
    entityId: payment._id,
    beforeState: payment.toObject(),
    ipAddress,
  });

  return { message: 'Payment record deleted successfully' };
}

/**
 * GET /api/landlord/rentroll/export
 * Export rent roll data as CSV formatted text or JSON
 */
export async function exportRentRoll(landlordId, query = {}, context = {}) {
  const result = await getRentRoll(landlordId, query, context);
  const rows = result.payments;

  // Generate CSV text
  const headers = ['Transaction ID', 'Tenant Name', 'Tenant Email', 'Property', 'Unit', 'Period', 'Amount', 'Due Date', 'Status', 'Paid At', 'Payment Method'];
  const csvLines = [headers.join(',')];

  for (const r of rows) {
    const line = [
      `"${r.mockTransactionId || r.id}"`,
      `"${r.tenantName}"`,
      `"${r.tenantEmail}"`,
      `"${r.propertyName}"`,
      `"${r.unitLabel}"`,
      `"${r.period}"`,
      `"${r.amount}"`,
      `"${r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : ''}"`,
      `"${r.status}"`,
      `"${r.paidAt ? new Date(r.paidAt).toISOString() : ''}"`,
      `"${r.paymentMethod || ''}"`,
    ];
    csvLines.push(line.join(','));
  }

  return {
    filename: `Rent_Roll_Export_${new Date().toISOString().slice(0, 10)}.csv`,
    csv: csvLines.join('\n'),
    count: rows.length,
    data: rows,
    summary: result.summary,
  };
}
