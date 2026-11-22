import { getLandlordProperties } from '../landlord/properties/properties.service.js';
import { getLandlordTickets } from '../landlord/tickets/tickets.service.js';
import { getRentRoll } from '../landlord/rentroll/rentroll.service.js';
import { getLandlordAnnouncements } from '../landlord/announcements/announcements.service.js';
import { getLandlordDashboard } from '../landlord/dash/dash.service.js';
import { getStaffPropertyScope } from '../../shared/utils/staffPropertyScope.js';
import { User } from '../../shared/models/user.model.js';

export async function getStaffDashboard(req, res) {
  try {
    const landlordId = req.user.landlord;
    if (!landlordId) return res.status(403).json({ success: false, message: 'Staff account is not linked to a landlord.' });
    const scope = await getStaffPropertyScope(req.user);
    const context = { ...scope, staffType: req.user.staffType, staffId: req.user._id, landlordUser: scope?.landlordUser || await User.findById(landlordId).select('firstName lastName email').lean() };
    const [rentRoll, ticketResult, announcements, properties, dashboard] = await Promise.all([
      req.user.staffType === 'technician' ? Promise.resolve({ payments: [], summary: {} }) : getRentRoll(landlordId, {}, context),
      getLandlordTickets(landlordId, {}, context),
      req.user.staffType === 'technician' ? Promise.resolve([]) : getLandlordAnnouncements(landlordId, {}, { propertyIds: context.propertyIds }),
      Promise.resolve(getLandlordProperties(landlordId, context)),
      req.user.staffType === 'technician'
        ? Promise.resolve({ kpi: { pendingTickets: 0 }, propertyBreakdown: [], recentTickets: [], recentPayments: [] })
        : getLandlordDashboard(landlordId, context),
    ]);
    const staffProperties = properties.map((property) => ({ id: property.id, _id: property._id, name: property.name }));
    const staffUnits = properties.flatMap((property) => (property.units || []).map((unit) => ({
      id: unit.id,
      _id: unit._id,
      label: unit.label,
      status: unit.status,
      isActive: unit.isActive,
      monthlyRent: unit.monthlyRent,
      propertyId: String(property._id),
      property: String(property._id),
      tenantName: unit.tenantName,
    })));
    return res.status(200).json({
      success: true,
      data: {
        staffType: req.user.staffType || 'property_manager',
        payments: rentRoll.payments,
        paymentSummary: rentRoll.summary,
        dashboard: {
          kpi: dashboard.kpi,
          propertyBreakdown: dashboard.propertyBreakdown,
          recentTickets: dashboard.recentTickets,
          recentPayments: dashboard.recentPayments,
          pinnedAnnouncement: dashboard.pinnedAnnouncement,
        },
        tickets: ticketResult.tickets,
        announcements,
        properties: staffProperties,
        units: staffUnits,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}
