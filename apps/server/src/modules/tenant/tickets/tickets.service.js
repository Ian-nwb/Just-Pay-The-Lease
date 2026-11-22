import mongoose from 'mongoose';
import Ticket from '../../../shared/models/ticket.model.js';
import Unit from '../../../shared/models/unit.model.js';
import Property from '../../../shared/models/property.model.js';
import User from '../../../shared/models/user.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import { createNotification } from '../../../shared/services/notification.service.js';
import { assertTenantHasActiveLease } from '../../../shared/services/tenantLeaseAccess.service.js';

export class TenantTicketError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function logAction({ actorId, action, entityKind = 'Ticket', entityId, beforeState = null, afterState = null, ipAddress = '' }) {
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
    console.error('Tenant Ticket AuditLog error:', err.message);
  }
}

/**
 * GET all tickets for authenticated tenant
 */
export async function getTenantTickets(tenantId, query = {}) {
  const { status } = query;

  const matchFilter = { tenant: tenantId };
  if (status && status !== 'all') {
    matchFilter.status = status;
  }

  const rawTickets = await Ticket.find(matchFilter)
    .populate('unit')
    .populate('statusHistory.changedBy', 'firstName lastName email role')
    .sort({ createdAt: -1 })
    .lean();

  const propertyIds = rawTickets.map((t) => t.unit?.property).filter(Boolean);
  const properties = await Property.find({ _id: { $in: propertyIds } }).lean();
  const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

  const formattedTickets = rawTickets.map((t) => {
    const propertyDoc = t.unit?.property ? propertyMap.get(t.unit.property.toString()) : null;

    const statusHistory = (t.statusHistory || []).map((h) => {
      let displayName = 'Landlord';
      if (h.changedBy && typeof h.changedBy === 'object') {
        displayName = `${h.changedBy.firstName || ''} ${h.changedBy.lastName || ''}`.trim() || h.changedBy.email || (h.userRole === 'landlord' ? 'Landlord' : 'User');
      } else if (h.userRole === 'landlord') {
        displayName = 'Landlord';
      } else if (h.userRole === 'tenant') {
        displayName = 'You';
      } else if (h.userRole === 'system') {
        displayName = 'System';
      } else if (typeof h.changedBy === 'string' && !/^[0-9a-fA-F]{24}$/.test(h.changedBy)) {
        displayName = h.changedBy;
      }
      return {
        ...h,
        changedByName: displayName,
        changedBy: displayName,
      };
    });

    return {
      ...t,
      id: t._id,
      unitId: t.unit?._id || null,
      unitLabel: t.unit?.label || 'Unit N/A',
      propertyId: propertyDoc?._id || null,
      propertyName: propertyDoc?.name || 'Property N/A',
      propertyAddress: propertyDoc?.address || '',
      statusHistory,
    };
  });

  const totalOpen = formattedTickets.filter((t) => !['resolved', 'closed', 'cancelled'].includes(t.status)).length;
  const totalResolved = formattedTickets.filter((t) => t.status === 'resolved').length;

  return {
    tickets: formattedTickets,
    metrics: {
      total: formattedTickets.length,
      open: totalOpen,
      resolved: totalResolved,
    },
  };
}

/**
 * GET single ticket by ID for tenant
 */
export async function getTenantTicketById(tenantId, ticketId) {
  const ticket = await Ticket.findOne({ _id: ticketId, tenant: tenantId })
    .populate('unit')
    .lean();

  if (!ticket) throw new TenantTicketError('Ticket not found or access denied', 404);

  const property = ticket.unit?.property
    ? await Property.findById(ticket.unit.property).lean()
    : null;

  return {
    ...ticket,
    id: ticket._id,
    unitLabel: ticket.unit?.label || 'Unit N/A',
    propertyName: property?.name || 'Property N/A',
    propertyAddress: property?.address || '',
  };
}

/**
 * SUBMIT a new maintenance ticket (Tenant)
 */
export async function submitTenantTicket(tenantId, payload, ipAddress = '') {
  const { title, description, category, priority = 'medium', photoUrls = [], unitId } = payload;

  if (!title?.trim()) throw new TenantTicketError('Ticket title is required', 400);
  if (!description?.trim()) throw new TenantTicketError('Issue description is required', 400);

  // Lease-scoped assignment is authoritative; never fall back to another occupied unit.
  const tenantLease = await assertTenantHasActiveLease(tenantId);
  const assignedUnitId = String(tenantLease.unitId?._id || tenantLease.unitId);
  if (unitId && String(unitId) !== assignedUnitId) throw new TenantTicketError('You can only submit maintenance for your assigned unit.', 403);
  const targetUnit = await Unit.findOne({ _id: assignedUnitId, property: tenantLease.property._id, isActive: { $ne: false } }).lean();
  if (!targetUnit) throw new TenantTicketError('Your assigned unit is unavailable. Contact the landlord.', 409);

  const property = await Property.findById(targetUnit.property).lean();
  const tenantUser = await User.findById(tenantId).select('preferences.maintenance').lean();
  const allowedEntryPreferences = ['ok_if_not_home', 'must_be_present', 'custom'];
  const accessPreference = payload.accessPreference || tenantUser?.preferences?.maintenance?.accessPreference || 'must_be_present';
  if (!allowedEntryPreferences.includes(accessPreference)) throw new TenantTicketError('Choose a valid maintenance access preference.', 400);
  const accessNote = String(payload.accessNote ?? tenantUser?.preferences?.maintenance?.accessNote ?? '').trim();
  if (accessNote.length > 500) throw new TenantTicketError('Maintenance access notes must be 500 characters or fewer.', 400);

  const initialHistory = [
    {
      status: 'submitted',
      changedBy: new mongoose.Types.ObjectId(tenantId),
      userRole: 'tenant',
      note: 'Maintenance ticket submitted by tenant',
      timestamp: new Date(),
    },
  ];

  const ticket = await Ticket.create({
    title: title.trim(),
    description: description.trim(),
    category: category || 'General',
    priority: priority || 'medium',
    status: 'submitted',
    unit: targetUnit._id,
    tenant: tenantId,
    photoUrls,
    entryPreference: accessPreference,
    entryNote: accessNote,
    petsPresent: Boolean(payload.petsPresent),
    assignedTechnician: null,
    statusHistory: initialHistory,
  });

  await logAction({
    actorId: tenantId,
    action: 'TICKET_SUBMITTED',
    entityId: ticket._id,
    afterState: ticket.toObject(),
    ipAddress,
  });

  if (property?.landlord) {
    createNotification({
      userId: property.landlord,
      title: '🔧 New Maintenance Ticket',
      body: `${title.trim().slice(0, 50)} (Unit: ${targetUnit.label})`,
      type: 'maintenance',
      refModel: 'Ticket',
      refId: ticket._id,
      alertCategory: 'newTicket',
    });
  }

  return {
    ...ticket.toObject(),
    id: ticket._id,
    unitLabel: targetUnit.label,
    propertyName: property?.name || 'Property N/A',
  };
}

/**
 * CANCEL ticket (Tenant)
 */
export async function cancelTenantTicket(tenantId, ticketId, reason = '', ipAddress = '') {
  const ticket = await Ticket.findOne({ _id: ticketId, tenant: tenantId });
  if (!ticket) throw new TenantTicketError('Ticket not found or access denied', 404);

  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    throw new TenantTicketError('Cannot cancel an already resolved or closed ticket', 400);
  }

  const beforeState = ticket.toObject();

  ticket.status = 'cancelled';
  ticket.statusHistory.push({
    status: 'cancelled',
    changedBy: new mongoose.Types.ObjectId(tenantId),
    userRole: 'tenant',
    note: reason ? `Cancelled by tenant: ${reason}` : 'Cancelled by tenant',
    timestamp: new Date(),
  });

  await ticket.save();

  await logAction({
    actorId: tenantId,
    action: 'TICKET_CANCELLED',
    entityId: ticket._id,
    beforeState,
    afterState: ticket.toObject(),
    ipAddress,
  });

  try {
    const unitDoc = await Unit.findById(ticket.unit).populate('property').lean();
    if (unitDoc?.property?.landlord) {
      createNotification({
        userId: unitDoc.property.landlord,
        title: '⚠️ Maintenance Ticket Cancelled',
        body: `Ticket "${ticket.title}" (${unitDoc.label}) was cancelled by the tenant.`,
        type: 'maintenance',
        refModel: 'Ticket',
        refId: ticket._id,
        alertCategory: 'newTicket',
      });
    }
  } catch (err) {
    console.error('Error notifying landlord of cancellation:', err.message);
  }

  return {
    success: true,
    message: 'Ticket cancelled successfully',
    ticket: { ...ticket.toObject(), id: ticket._id },
  };
}

/**
 * ADD comment / note to ticket (Tenant)
 */
export async function addTenantComment(tenantId, ticketId, note, ipAddress = '') {
  if (!note?.trim()) throw new TenantTicketError('Note content cannot be empty', 400);

  const ticket = await Ticket.findOne({ _id: ticketId, tenant: tenantId });
  if (!ticket) throw new TenantTicketError('Ticket not found or access denied', 404);

  ticket.statusHistory.push({
    status: ticket.status,
    changedBy: new mongoose.Types.ObjectId(tenantId),
    userRole: 'tenant',
    note: note.trim(),
    timestamp: new Date(),
  });

  await ticket.save();

  await logAction({
    actorId: tenantId,
    action: 'TICKET_COMMENT_ADDED',
    entityId: ticket._id,
    ipAddress,
  });

  return {
    success: true,
    message: 'Comment added',
    ticket: { ...ticket.toObject(), id: ticket._id },
  };
}

/**
 * DELETE ticket (Tenant)
 */
export async function deleteTenantTicket(tenantId, ticketId, ipAddress = '') {
  const ticket = await Ticket.findOne({ _id: ticketId, tenant: tenantId });
  if (!ticket) throw new TenantTicketError('Ticket not found or access denied', 404);

  const beforeState = ticket.toObject();
  await Ticket.findByIdAndDelete(ticketId);

  await logAction({
    actorId: tenantId,
    action: 'TICKET_DELETED_BY_TENANT',
    entityId: ticketId,
    beforeState,
    ipAddress,
  });

  return { success: true, message: 'Ticket deleted successfully', ticketId };
}
