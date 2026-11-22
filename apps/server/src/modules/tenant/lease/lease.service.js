import Lease from '../../../shared/models/lease.model.js';
import Unit from '../../../shared/models/unit.model.js';
import Property from '../../../shared/models/property.model.js';
import TenantProfile from '../../../shared/models/tenantProfile.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import { createNotification } from '../../../shared/services/notification.service.js';
import { assertTenantHasActiveLease } from '../../../shared/services/tenantLeaseAccess.service.js';
import { addCalendarDays, addCalendarMonths, calendarDateAsUTCDate, getRenewalWindow, parseCalendarDate, propertyToday, toPropertyCalendarDate } from '../../../shared/utils/propertyDatePolicy.js';

export class LeaseError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function logAction({ actorId, action, entityKind = 'Lease', entityId, beforeState = null, afterState = null, ipAddress = '' }) {
  try {
    await AuditLog.create({
      actor: actorId,
      actorRole: 'tenant',
      action,
      entityKind,
      entityId,
      beforeState,
      afterState,
      ipAddress,
    });
  } catch (err) {
    console.error('Lease AuditLog error:', err.message);
  }
}

/**
 * GET or initialize active lease for tenant
 */
export async function getTenantLease(tenantId) {
  let lease = await Lease.findOne({ tenant: tenantId, status: { $ne: 'ended' } })
    .populate('property')
    .populate('unit')
    .lean();

  if (!lease) {
    // If not in Lease collection yet, resolve from Unit & TenantProfile
    const unit = await Unit.findOne({ tenant: tenantId }).populate('property').lean();
    const profile = await TenantProfile.findOne({ user: tenantId }).lean();

    if (!unit) {
      throw new LeaseError('No active lease or unit assignment found for your tenant account', 404);
    }

    // Build the lease record only from what the landlord actually entered.
    // Never invent rent, dates, or a contract file.
    const landlordId = unit.property?.landlord || profile?.landlord;
    const timezone = unit.property?.timezone || 'Asia/Manila';
    const monthlyRent = Number(unit.monthlyRent || profile?.monthlyRent || 0);
    const leaseStart = toPropertyCalendarDate(unit.leaseStart || profile?.leaseStart, timezone);
    const leaseType = unit.leaseType || profile?.leaseType || (unit.leaseEnd || profile?.leaseEnd ? 'fixed_term' : 'indefinite');
    const leaseEnd = leaseType === 'indefinite' ? null : toPropertyCalendarDate(unit.leaseEnd || profile?.leaseEnd, timezone);
    if (!landlordId || !leaseStart || !(monthlyRent > 0) || (leaseType === 'fixed_term' && !leaseEnd)) {
      throw new LeaseError('Your lease details are incomplete. Ask your landlord to finish your lease setup.', 409);
    }

    const createdLease = await Lease.create({
      tenant: tenantId,
      landlord: landlordId,
      property: unit.property._id,
      unit: unit._id,
      leaseStart,
      leaseType,
      leaseEnd,
      monthlyRent,
      securityDeposit: Number(profile?.securityDeposit || 0),
      status: 'active',
      contractPdfUrl: null,
      covenants: [],
    });

    lease = await Lease.findById(createdLease._id)
      .populate('property')
      .populate('unit')
      .lean();
  }

  const renewalWindowDays = Number(lease.property?.renewalWindowDays ?? 60);
  const timezone = lease.property?.timezone || 'Asia/Manila';
  const renewalWindow = lease.leaseEnd
    ? getRenewalWindow({ leaseEnd: lease.leaseEnd, renewalWindowDays, timezone })
    : { leaseEndDate: null, opensOn: null, daysRemaining: null, isExpired: false, isOpen: false };

  return {
    ...lease,
    id: lease._id,
    unitLabel: lease.unit?.label || 'Unit N/A',
    propertyName: lease.property?.name || 'Property N/A',
    propertyAddress: lease.property?.address || '',
    daysRemaining: renewalWindow.daysRemaining,
    renewalWindowOpensAt: renewalWindow.opensOn,
    renewalWindowDays,
    isRenewalWindowOpen: renewalWindow.isOpen,
    isLeaseExpired: renewalWindow.isExpired,
  };
}

/**
 * SUBMIT lease extension / renewal request
 */
export async function requestLeaseExtension(tenantId, payload, ipAddress = '') {
  await assertTenantHasActiveLease(tenantId);
  const { termMonths = 12, proposedStartDate, notes = '' } = payload;
  const cleanNotes = typeof notes === 'string' ? notes.trim() : '';
  if (cleanNotes.length > 2000) throw new LeaseError('Renewal notes must be 2,000 characters or fewer.', 400);

  const normalizedTermMonths = Number(termMonths);
  if (![6, 12, 24].includes(normalizedTermMonths)) throw new LeaseError('Choose a 6, 12, or 24 month extension term.', 400);

  let lease = await Lease.findOne({ tenant: tenantId, status: { $ne: 'ended' } });
  if (!lease) {
    // Resolve lease
    await getTenantLease(tenantId);
    lease = await Lease.findOne({ tenant: tenantId, status: { $ne: 'ended' } });
  }

  if (!lease) {
    throw new LeaseError('No active lease found to extend', 404);
  }
  if (lease.leaseType === 'indefinite' || !lease.leaseEnd) throw new LeaseError('An indefinite lease does not need an extension.', 409);
  const property = await Property.findById(lease.property).select('renewalWindowDays timezone').lean();
  const renewalWindowDays = Number(property?.renewalWindowDays ?? 60);
  const timezone = property?.timezone || 'Asia/Manila';
  const renewalWindow = getRenewalWindow({ leaseEnd: lease.leaseEnd, renewalWindowDays, timezone });
  if (renewalWindow.isExpired) throw new LeaseError('This lease has passed its end date. Ask your landlord to renew or update the lease before submitting an extension request.', 409);
  if (!renewalWindow.isOpen) throw new LeaseError(`Lease renewal requests open ${renewalWindowDays} days before the lease end date (${renewalWindow.opensOn || 'date unavailable'} property local time).`, 409);

  const currentLeaseEnd = parseCalendarDate(lease.leaseEnd, timezone);
  const proposedStart = proposedStartDate ? parseCalendarDate(proposedStartDate, timezone) : addCalendarDays(currentLeaseEnd, 1);
  const earliestStart = addCalendarDays(currentLeaseEnd, 1);
  if (!proposedStart || proposedStart < earliestStart) throw new LeaseError(`The proposed start date must be ${earliestStart} or later in the property timezone.`, 400);
  const proposedEnd = addCalendarMonths(proposedStart, normalizedTermMonths);
  const startDate = calendarDateAsUTCDate(proposedStart);
  const endDate = calendarDateAsUTCDate(proposedEnd);
  if (!startDate || !endDate) throw new LeaseError('Choose a valid proposed lease start date.', 400);

  const newExtensionRequest = {
    termMonths: normalizedTermMonths,
    proposedStartDate: startDate,
    proposedEndDate: endDate,
    monthlyRent: lease.monthlyRent,
    tenantNotes: cleanNotes,
    status: 'pending',
    requestedAt: new Date(),
  };

  lease.extensionRequests.push(newExtensionRequest);
  lease.status = 'renewal_pending';
  await lease.save();

  await logAction({
    actorId: tenantId,
    action: 'LEASE_EXTENSION_REQUESTED',
    entityId: lease._id,
    afterState: newExtensionRequest,
    ipAddress,
  });

  const createdRequest = lease.extensionRequests[lease.extensionRequests.length - 1];

  return {
    success: true,
    message: `Lease extension request for ${normalizedTermMonths} months submitted successfully.`,
    extensionRequest: createdRequest,
    leaseStatus: lease.status,
  };
}

export async function requestEarlyTermination(tenantId, { requestedMoveOutDate, reason } = {}, ipAddress = '') {
  await assertTenantHasActiveLease(tenantId);
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason || cleanReason.length > 2000) throw new LeaseError('Please provide a reason (up to 2,000 characters).', 400);
  const moveOutDate = new Date(requestedMoveOutDate);
  if (!requestedMoveOutDate || Number.isNaN(moveOutDate.getTime())) throw new LeaseError('Choose a valid requested move-out date.', 400);
  const lease = await Lease.findOne({ tenant: tenantId, status: { $in: ['active', 'renewal_pending', 'renewal_approved'] } }).populate('property', 'name timezone').populate('unit', 'label');
  if (!lease) throw new LeaseError('No active lease was found for your account.', 404);
  const timezone = lease.property?.timezone || 'Asia/Manila';
  const requestedDate = parseCalendarDate(requestedMoveOutDate, timezone);
  const today = propertyToday(new Date(), timezone);
  const leaseEndDate = lease.leaseEnd ? parseCalendarDate(lease.leaseEnd, timezone) : null;
  if (!requestedDate || requestedDate <= today || (leaseEndDate && requestedDate >= leaseEndDate)) throw new LeaseError(leaseEndDate ? 'The requested move-out date must be after today and before the current lease end date in the property timezone.' : 'The requested move-out date must be after today in the property timezone.', 400);
  if (lease.terminationRequests.some((request) => request.status === 'pending')) throw new LeaseError('You already have an early lease termination request awaiting review.', 409);
  const request = { requestedMoveOutDate: moveOutDate, reason: cleanReason, status: 'pending', requestedAt: new Date() };
  lease.terminationRequests.push(request);
  await lease.save();
  await logAction({ actorId: tenantId, action: 'EARLY_LEASE_TERMINATION_REQUESTED', entityId: lease._id, afterState: request, ipAddress });
  await createNotification({ userId: lease.landlord, title: 'Early lease termination requested', body: `${lease.unit?.label || 'A tenant'} requested an early move-out date of ${moveOutDate.toLocaleDateString()}.`, type: 'lease', refModel: 'Lease', refId: lease._id });
  const created = lease.terminationRequests[lease.terminationRequests.length - 1];
  return { success: true, message: 'Your early lease termination request was sent to your landlord.', request: created, leaseId: lease._id };
}

/**
 * GET full lease data for PDF generation (includes populated names)
 */
export async function getLeaseDocument(tenantId) {
  const lease = await Lease.findOne({ tenant: tenantId, status: { $ne: 'ended' } })
    .populate('property')
    .populate('unit')
    .populate('tenant', 'firstName lastName email')
    .populate('landlord', 'firstName lastName email')
    .lean();

  if (!lease) {
    // Fallback — initialise lease first then re-query
    await getTenantLease(tenantId);
    const fallback = await Lease.findOne({ tenant: tenantId, status: { $ne: 'ended' } })
      .populate('property')
      .populate('unit')
      .populate('tenant', 'firstName lastName email')
      .populate('landlord', 'firstName lastName email')
      .lean();
    if (!fallback) throw new LeaseError('No active lease found', 404);
    return buildLeaseDocData(fallback);
  }

  return buildLeaseDocData(lease);
}

function buildLeaseDocData(lease) {
  const tenantName = lease.tenant
    ? `${lease.tenant.firstName || ''} ${lease.tenant.lastName || ''}`.trim() || lease.tenant.email
    : '—';
  const landlordName = lease.landlord
    ? `${lease.landlord.firstName || ''} ${lease.landlord.lastName || ''}`.trim() || lease.landlord.email
    : '—';

  return {
    id: lease._id,
    tenantName,
    landlordName,
    propertyName: lease.property?.name || 'Property N/A',
    propertyAddress: lease.property?.address || '',
    unitLabel: lease.unit?.label || 'Unit N/A',
    unitBedrooms: lease.unit?.bedrooms || null,
    unitBathrooms: lease.unit?.bathrooms || null,
    unitSqft: lease.unit?.sqft || null,
    leaseStart: lease.leaseStart,
    leaseType: lease.leaseType || (lease.leaseEnd ? 'fixed_term' : 'indefinite'),
    leaseEnd: lease.leaseEnd,
    monthlyRent: lease.monthlyRent,
    securityDeposit: lease.securityDeposit,
    hasParking: lease.hasParking,
    parkingSpot: lease.parkingSpot,
    parkingFee: lease.parkingFee,
    status: lease.status,
    covenants: lease.covenants,
    extensionRequests: lease.extensionRequests || [],
    contractPdfUrl: lease.contractPdfUrl,
  };
}
