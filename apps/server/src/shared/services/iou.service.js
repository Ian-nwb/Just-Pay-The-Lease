import mongoose from 'mongoose';
import IOU from '../models/iou.model.js';
import Payment from '../models/payment.model.js';
import Property from '../models/property.model.js';
import AuditLog from '../models/auditLog.model.js';
import { createNotification } from './notification.service.js';
import { parseCalendarDate, propertyToday } from '../utils/propertyDatePolicy.js';

export class IouError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

const remaining = (payment) => Math.max(0, Number(payment.amount || 0) - Number(payment.paidAmount || (payment.status === 'paid' ? payment.amount : 0)));

export async function createTenantIou(tenantId, paymentId, body = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(paymentId)) throw new IouError('Invalid invoice ID', 400);
  const payment = await Payment.findOne({ _id: paymentId, tenant: tenantId });
  if (!payment) throw new IouError('Invoice not found or access denied', 404);
  if (!['pending', 'overdue', 'partially_paid'].includes(payment.status) || payment.reviewStatus === 'pending_review') throw new IouError('This invoice cannot accept an IOU request right now', 409);

  const amount = Number(body.amount);
  const reason = String(body.reason || '').trim();
  const property = await Property.findById(payment.property).select('landlord timezone').lean();
  const proposedCalendarDate = parseCalendarDate(body.proposedDueDate, property?.timezone || 'Asia/Manila');
  const today = propertyToday(new Date(), property?.timezone || 'Asia/Manila');
  const proposedDueDate = proposedCalendarDate ? new Date(`${proposedCalendarDate}T00:00:00.000Z`) : new Date(NaN);
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - remaining(payment)) > 0.01) throw new IouError('An IOU request must cover the full current outstanding balance', 400);
  if (reason.length < 8 || reason.length > 2000) throw new IouError('Explain the reason in 8 to 2000 characters', 400);
  if (Number.isNaN(proposedDueDate.getTime()) || !today || proposedCalendarDate <= today) throw new IouError('Choose a valid future due date', 400);
  if (await IOU.exists({ payment: payment._id, tenant: tenantId, status: 'pending' })) throw new IouError('An IOU request is already awaiting review for this invoice', 409);
  if (!property?.landlord) throw new IouError('The invoice is not attached to an active landlord property', 409);

  const iou = await IOU.create({ payment: payment._id, tenant: tenantId, landlord: property.landlord, property: payment.property, amount, reason, proposedDueDate, originalDueDate: payment.dueDate });
  await AuditLog.create({ actor: tenantId, actorRole: 'tenant', action: 'IOU_REQUESTED', entityKind: 'Payment', entityId: payment._id, afterState: { iouId: iou._id, amount, proposedDueDate }, ipAddress });
  await createNotification({ userId: property.landlord, title: 'Rent IOU request', body: `A tenant requested an IOU of ₱${amount.toLocaleString()} for ${payment.period || 'rent'}.`, type: 'payment', refModel: 'Payment', refId: payment._id });
  return iou.toObject();
}

export async function getTenantIous(tenantId) {
  return IOU.find({ tenant: tenantId }).populate('payment', 'amount paidAmount outstandingBalance period dueDate status').sort({ createdAt: -1 }).lean();
}

export async function getLandlordIous(landlordId, paymentId, context = {}) {
  const payment = await Payment.findOne({ _id: paymentId, tenant: { $exists: true } }).select('property').lean();
  if (!payment) throw new IouError('Invoice not found or access denied', 404);
  const property = await Property.findOne({ _id: payment.property, landlord: landlordId }).select('_id').lean();
  if (!property || (context.propertyIds && !context.propertyIds.some((id) => String(id) === String(property._id)))) throw new IouError('Invoice not found or access denied', 404);
  return IOU.find({ payment: paymentId }).populate('tenant', 'firstName lastName email').populate('payment', 'amount paidAmount period dueDate status').sort({ createdAt: -1 }).lean();
}

export async function reviewIou(landlordId, iouId, body = {}, context = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(iouId)) throw new IouError('Invalid IOU ID', 400);
  if (!['approve', 'reject'].includes(body.action)) throw new IouError('Choose approve or reject', 400);
  const iou = await IOU.findOne({ _id: iouId, landlord: landlordId });
  if (!iou || (context.propertyIds && !context.propertyIds.some((id) => String(id) === String(iou.property)))) throw new IouError('IOU request not found or access denied', 404);
  if (iou.status !== 'pending') throw new IouError('This IOU request has already been reviewed', 409);
  if (body.action === 'reject' && !String(body.note || '').trim()) throw new IouError('A reason is required when declining an IOU', 400);
  const payment = await Payment.findOne({ _id: iou.payment, tenant: iou.tenant });
  if (!payment || iou.amount > remaining(payment)) throw new IouError('The invoice balance changed; review this IOU against the current balance', 409);

  iou.status = body.action === 'approve' ? 'approved' : 'rejected';
  iou.decisionNote = String(body.note || '').trim().slice(0, 1000);
  iou.reviewedBy = landlordId;
  iou.reviewedAt = new Date();
  if (body.action === 'approve') {
    payment.dueDate = iou.proposedDueDate;
    payment.status = Number(payment.paidAmount || 0) > 0 ? 'partially_paid' : 'pending';
    await payment.save();
    iou.appliedAt = iou.reviewedAt;
  }
  await iou.save();
  await AuditLog.create({ actor: landlordId, actorRole: context.propertyIds ? 'staff' : 'landlord', action: body.action === 'approve' ? 'IOU_APPROVED' : 'IOU_REJECTED', entityKind: 'Payment', entityId: payment._id, afterState: { iouId: iou._id, status: iou.status, note: iou.decisionNote }, ipAddress });
  await createNotification({ userId: iou.tenant, title: iou.status === 'approved' ? 'IOU request approved' : 'IOU request declined', body: iou.status === 'approved' ? `Your IOU request was approved. The invoice balance remains unpaid and its due date is now ${iou.proposedDueDate.toLocaleDateString()}.` : `Your IOU request was declined.${iou.decisionNote ? ` ${iou.decisionNote}` : ''}`, type: 'payment', refModel: 'Payment', refId: payment._id });
  return iou.toObject();
}
