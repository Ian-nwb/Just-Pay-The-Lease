import Lease from '../models/lease.model.js';
import TenantProfile from '../models/tenantProfile.model.js';
import Property from '../models/property.model.js';
import { parseCalendarDate, propertyToday } from '../utils/propertyDatePolicy.js';

export class TenantLeaseAccessError extends Error {
  constructor(message, statusCode = 409) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Active tenant actions are available from leaseStart through leaseEnd
 * (inclusive), using the property's local calendar date. A pre-added resident
 * can still authenticate and view setup/account pages, but cannot create
 * lease-bound records until an assignment is effective.
 */
export async function getEffectiveTenantLease(tenantId) {
  const [lease, profile] = await Promise.all([
    Lease.findOne({ tenant: tenantId, status: { $in: ['active', 'renewal_pending', 'renewal_approved'] } })
      .sort({ updatedAt: -1, createdAt: -1 }).populate('property', 'timezone status').lean(),
    TenantProfile.findOne({ user: tenantId }).populate('property', 'timezone status').lean(),
  ]);
  const property = lease?.property || profile?.property || null;
  return {
    lease,
    profile,
    property,
    unitId: lease?.unit || profile?.unit || null,
    status: profile?.status || 'pre_added',
    leaseStart: lease?.leaseStart || profile?.leaseStart || null,
    leaseEnd: lease?.leaseEnd || profile?.leaseEnd || null,
    leaseType: lease?.leaseType || profile?.leaseType || 'fixed_term',
  };
}

export async function assertTenantHasActiveLease(tenantId, now = new Date()) {
  const context = await getEffectiveTenantLease(tenantId);
  if (context.status !== 'active' || !context.unitId || !context.property || context.property.status === 'inactive') {
    throw new TenantLeaseAccessError('Your resident access is read-only until a landlord assigns an active lease.', 409);
  }
  const timezone = context.property.timezone || 'Asia/Manila';
  const today = propertyToday(now, timezone);
  const leaseStart = parseCalendarDate(context.leaseStart, timezone);
  const leaseEnd = parseCalendarDate(context.leaseEnd, timezone);
  if (!today || !leaseStart) throw new TenantLeaseAccessError('Your lease dates are incomplete. Contact the landlord.', 409);
  if (today < leaseStart) throw new TenantLeaseAccessError(`Tenant access begins on ${leaseStart}.`, 403);
  if (context.leaseType !== 'indefinite' && leaseEnd && today > leaseEnd) {
    throw new TenantLeaseAccessError('Your lease term has ended. Contact the landlord to continue access.', 403);
  }
  return context;
}

/**
 * Weaker check for setup actions that may happen before move-in (uploading
 * documents, signing the lease PDF): the tenant must hold a current, not-ended
 * assignment on an active property, but the lease start date need not have arrived.
 */
export async function assertTenantAssigned(tenantId, now = new Date()) {
  const context = await getEffectiveTenantLease(tenantId);
  if (context.status !== 'active' || !context.unitId || !context.property || context.property.status === 'inactive') {
    throw new TenantLeaseAccessError('Your resident access is read-only until a landlord assigns an active lease.', 409);
  }
  const timezone = context.property.timezone || 'Asia/Manila';
  const leaseEnd = parseCalendarDate(context.leaseEnd, timezone);
  if (context.leaseType !== 'indefinite' && leaseEnd && propertyToday(now, timezone) > leaseEnd) {
    throw new TenantLeaseAccessError('Your lease term has ended. Contact the landlord to continue access.', 403);
  }
  return context;
}

export async function getTenantLeaseReadContext(tenantId) {
  const context = await getEffectiveTenantLease(tenantId);
  if (context.property?._id && context.property.status === 'inactive') {
    throw new TenantLeaseAccessError('This property is inactive. Contact the landlord.', 409);
  }
  return context;
}
