import Property from '../models/property.model.js';
import Unit from '../models/unit.model.js';
import User from '../models/user.model.js';
import Ticket from '../models/ticket.model.js';

export async function getStaffPropertyScope(user) {
  if (user?.role !== 'staff' || !user.landlord) return null;
  const propertyIds = (user.propertyAssignments || []).map((id) => String(id));
  const [landlordUser, properties] = await Promise.all([
    User.findById(user.landlord).select('firstName lastName email').lean(),
    propertyIds.length
      ? Property.find({ _id: { $in: propertyIds }, landlord: user.landlord, status: { $ne: 'inactive' } }).lean()
      : Promise.resolve([]),
  ]);
  const assignedIds = properties.map((property) => property._id);
  const units = assignedIds.length ? await Unit.find({ property: { $in: assignedIds } }).populate('tenant', 'firstName middleName lastName email status createdAt preferences').lean() : [];
  const tenants = [...new Map(units.map((unit) => unit.tenant).filter(Boolean).map((tenant) => [String(tenant._id), tenant])).values()];
  return { landlordUser, properties, propertyIds: assignedIds, units, unitIds: units.map((unit) => unit._id), tenants };
}

export async function assertStaffUnitAccess(user, unitId) {
  if (user?.role !== 'staff') return true;
  const scope = await getStaffPropertyScope(user);
  return Boolean(scope?.unitIds.some((id) => String(id) === String(unitId)));
}

export async function assertStaffTicketAccess(user, ticketId) {
  if (user?.role !== 'staff') return true;
  const ticket = await Ticket.findById(ticketId).select('unit assignedStaff').lean();
  if (user.staffType === 'technician') return Boolean(ticket && String(ticket.assignedStaff || '') === String(user._id));
  return Boolean(ticket && await assertStaffUnitAccess(user, ticket.unit));
}
