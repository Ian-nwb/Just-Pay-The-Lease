import crypto from 'node:crypto';
import User from '../../../shared/models/user.model.js';
import Property from '../../../shared/models/property.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import SessionLog from '../../../shared/models/sessionLog.model.js';
import { sendStaffInviteEmail } from '../../../shared/utils/mailer.js';

export class StaffError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function audit(actorId, action, entityId, afterState = null) {
  await AuditLog.create({ actor: actorId, actorRole: 'landlord', action, entityKind: 'User', entityId, afterState });
}

export async function listStaff(landlordId) {
  return User.find({ landlord: landlordId, role: 'staff' })
    .select('firstName lastName email phone status staffType propertyAssignments createdAt lastLoginAt')
    .populate('propertyAssignments', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

export async function listTechnicians(landlordId, propertyIds = null) {
  const query = { landlord: landlordId, role: 'staff', staffType: 'technician', status: 'active' };
  if (propertyIds) query.propertyAssignments = { $in: propertyIds };
  return User.find(query)
    .select('firstName lastName email phone propertyAssignments')
    .populate('propertyAssignments', 'name')
    .sort({ firstName: 1, lastName: 1 })
    .lean();
}

export async function inviteStaff(landlordId, payload) {
  const firstName = payload.firstName?.trim();
  const lastName = payload.lastName?.trim();
  const email = payload.email?.trim().toLowerCase();
  const staffType = payload.staffType || 'property_manager';
  const propertyIds = Array.isArray(payload.propertyIds) ? [...new Set(payload.propertyIds.map(String))] : [];
  if (!firstName || !lastName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StaffError('First name, last name, and a valid email are required.', 400);
  }
  if (!['property_manager', 'technician'].includes(staffType)) throw new StaffError('Choose a valid staff role.', 400);
  if (propertyIds.length === 0) throw new StaffError('Assign at least one property to this staff member.', 400);

  const landlord = await User.findOne({ _id: landlordId, role: 'landlord', status: 'active' }).select('firstName lastName');
  if (!landlord) throw new StaffError('Landlord account not found or suspended.', 404);
  if (await User.exists({ email })) throw new StaffError('That email address is already registered.', 409);

  const properties = await Property.find({ _id: { $in: propertyIds }, landlord: landlordId, status: { $ne: 'inactive' } }).select('_id').lean();
  if (properties.length !== propertyIds.length) throw new StaffError('One or more selected properties are invalid or inactive.', 400);

  const temporaryPassword = `JPTL-${crypto.randomBytes(6).toString('hex')}7`;
  const staff = await User.create({ firstName, lastName, email, password: temporaryPassword, role: 'staff', staffType, propertyAssignments: propertyIds, landlord: landlordId, status: 'active' });
  const landlordName = [landlord.firstName, landlord.lastName].filter(Boolean).join(' ');
  const delivery = await sendStaffInviteEmail({ email, name: `${firstName} ${lastName}`, landlordName, password: temporaryPassword });
  if (!delivery.success) {
    await User.findByIdAndDelete(staff._id);
    throw new StaffError(`Staff account was not created because the invitation email failed: ${delivery.error}`, 502);
  }

  await audit(landlordId, 'STAFF_INVITED', staff._id, { email, firstName, lastName, staffType, propertyAssignments: propertyIds, status: staff.status });
  return { id: staff._id, firstName, lastName, email, staffType, propertyAssignments: properties, status: staff.status, createdAt: staff.createdAt, invitationSent: true };
}

export async function deactivateStaff(landlordId, staffId) {
  const staff = await User.findOneAndUpdate(
    { _id: staffId, landlord: landlordId, role: 'staff', status: 'active' },
    { $set: { status: 'suspended' } },
    { new: true }
  ).select('firstName lastName email status');
  if (!staff) throw new StaffError('Active staff member not found.', 404);
  await SessionLog.updateMany({ userId: staff._id, isActive: true }, { $set: { isActive: false, logoutAt: new Date() } });
  await audit(landlordId, 'STAFF_DEACTIVATED', staff._id, { email: staff.email, status: staff.status });
  return staff;
}

export async function reactivateStaff(landlordId, staffId) {
  const staff = await User.findOne({ _id: staffId, landlord: landlordId, role: 'staff', status: 'suspended' });
  if (!staff) throw new StaffError('Suspended staff member not found.', 404);
  const propertyIds = (staff.propertyAssignments || []).map(String);
  if (!propertyIds.length) throw new StaffError('Assign at least one active property before reactivating this staff member.', 409);
  const activePropertyCount = await Property.countDocuments({ _id: { $in: propertyIds }, landlord: landlordId, status: { $ne: 'inactive' } });
  if (!activePropertyCount) throw new StaffError('Assign at least one active property before reactivating this staff member.', 409);
  staff.status = 'active';
  await staff.save();
  await audit(landlordId, 'STAFF_REACTIVATED', staff._id, { email: staff.email, status: staff.status });
  return staff.populate('propertyAssignments', 'name');
}

export async function updateStaffAccess(landlordId, staffId, payload = {}) {
  const staff = await User.findOne({ _id: staffId, landlord: landlordId, role: 'staff' });
  if (!staff) throw new StaffError('Staff member not found.', 404);
  const staffType = payload.staffType || staff.staffType || 'property_manager';
  const propertyIds = Array.isArray(payload.propertyIds) ? [...new Set(payload.propertyIds.map(String))] : (staff.propertyAssignments || []).map(String);
  if (!['property_manager', 'technician'].includes(staffType)) throw new StaffError('Choose a valid staff role.', 400);
  if (!propertyIds.length) throw new StaffError('Assign at least one property to this staff member.', 400);
  const properties = await Property.find({ _id: { $in: propertyIds }, landlord: landlordId, status: { $ne: 'inactive' } }).select('_id').lean();
  if (properties.length !== propertyIds.length) throw new StaffError('One or more selected properties are invalid or inactive.', 400);
  const beforeState = { staffType: staff.staffType || 'property_manager', propertyAssignments: (staff.propertyAssignments || []).map(String) };
  staff.staffType = staffType;
  staff.propertyAssignments = propertyIds;
  await staff.save();
  await audit(landlordId, 'STAFF_ACCESS_UPDATED', staff._id, { beforeState, staffType, propertyAssignments: propertyIds });
  return staff.populate('propertyAssignments', 'name');
}
