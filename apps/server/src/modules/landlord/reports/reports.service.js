// Landlord business reports and CSV exports. Every query is scoped to the
// landlord's own properties; optional filters: month (YYYY-MM) and propertyId.
import mongoose from 'mongoose';
import Property from '../../../shared/models/property.model.js';
import Unit from '../../../shared/models/unit.model.js';
import User from '../../../shared/models/user.model.js';
import TenantProfile from '../../../shared/models/tenantProfile.model.js';
import Payment from '../../../shared/models/payment.model.js';
import Ticket from '../../../shared/models/ticket.model.js';
import UtilityBill from '../../../shared/models/utilityBill.model.js';

export class ReportError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const name = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || '' : '');

/** CSV with quoting and spreadsheet-formula neutralisation. */
export function toCsv(headers, rows) {
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

function monthRange(month) {
  if (!month) return null;
  if (!MONTH.test(month)) throw new ReportError('Month must be in YYYY-MM format.');
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

async function scope(landlordId, { propertyId } = {}) {
  const filter = { landlord: landlordId };
  if (propertyId) {
    if (!mongoose.Types.ObjectId.isValid(propertyId)) throw new ReportError('Invalid property.');
    filter._id = propertyId;
  }
  const properties = await Property.find(filter).select('name').lean();
  if (propertyId && !properties.length) throw new ReportError('Property not found.', 404);
  const ids = properties.map((p) => p._id);
  const units = await Unit.find({ property: { $in: ids } }).select('label property').lean();
  return { properties, ids, units, propName: new Map(properties.map((p) => [String(p._id), p.name])), unitLabel: new Map(units.map((u) => [String(u._id), u.label])) };
}

const confirmed = (p) => (p.paymentAllocations || []).filter((a) => !a.reversedAt);
const outstanding = (p) => Math.max(0, round(Number(p.amount) - Number(p.paidAmount || 0)));

/** Full rent roll / income ledger: one row per invoice. */
export async function rentRollRows(landlordId, query = {}) {
  const sc = await scope(landlordId, query);
  const range = monthRange(query.month);
  const filter = { property: { $in: sc.ids }, status: { $ne: 'draft' } };
  if (range) filter.dueDate = { $gte: range.start, $lt: range.end };
  const invoices = await Payment.find(filter).populate('tenant', 'firstName lastName email').sort({ dueDate: 1 }).lean();
  return invoices.map((p) => {
    const allocs = confirmed(p);
    const lastPaid = allocs.map((a) => a.confirmedAt).sort().pop();
    return {
      property: sc.propName.get(String(p.property)) || '', unit: sc.unitLabel.get(String(p.unit)) || '', tenant: name(p.tenant),
      period: p.period || '', type: p.chargeType === 'utility' ? 'Utility' : 'Rent', dueDate: day(p.dueDate),
      billed: round(p.amount), paid: round(p.paidAmount), outstanding: outstanding(p), status: p.status,
      lastPaymentDate: day(lastPaid), methods: [...new Set(allocs.map((a) => String(a.channel || '').replace(/_/g, ' ')))].join('; '),
      references: allocs.map((a) => a.reference).filter(Boolean).join('; '), receiptNumber: p.receiptNumber || '',
    };
  });
}

/** Per-property summary for a month: rent and utilities billed/collected/outstanding. */
export async function incomeSummary(landlordId, query = {}) {
  const month = query.month || new Date().toISOString().slice(0, 7);
  const range = monthRange(month);
  const sc = await scope(landlordId, query);
  const [due, paidInMonth] = await Promise.all([
    Payment.find({ property: { $in: sc.ids }, status: { $ne: 'draft' }, dueDate: { $gte: range.start, $lt: range.end } }).select('property amount paidAmount chargeType').lean(),
    Payment.find({ property: { $in: sc.ids }, 'paymentAllocations.confirmedAt': { $gte: range.start, $lt: range.end } }).select('property chargeType paymentAllocations').lean(),
  ]);
  const rows = new Map(sc.properties.map((p) => [String(p._id), { propertyId: p._id, property: p.name, rentBilled: 0, rentCollected: 0, rentOutstanding: 0, utilitiesBilled: 0, utilitiesCollected: 0, utilitiesOutstanding: 0, collectedInMonth: 0 }]));
  for (const p of due) {
    const r = rows.get(String(p.property));
    if (!r) continue;
    const key = p.chargeType === 'utility' ? 'utilities' : 'rent';
    r[`${key}Billed`] += Number(p.amount);
    r[`${key}Collected`] += Number(p.paidAmount || 0);
    r[`${key}Outstanding`] += outstanding(p);
  }
  for (const p of paidInMonth) {
    const r = rows.get(String(p.property));
    if (!r) continue;
    for (const a of confirmed(p)) if (a.confirmedAt >= range.start && a.confirmedAt < range.end) r.collectedInMonth += Number(a.amount);
  }
  const list = [...rows.values()].map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v])));
  const totals = list.reduce((t, r) => { for (const k of Object.keys(r)) if (typeof r[k] === 'number') t[k] = round((t[k] || 0) + r[k]); return t; }, {});
  return { month, rows: list, totals };
}

export async function tenantRows(landlordId, query = {}) {
  const sc = await scope(landlordId, query);
  const tenants = await User.find({ landlord: landlordId, role: 'tenant' }).select('firstName lastName email phone status preferences').lean();
  const profiles = new Map((await TenantProfile.find({ user: { $in: tenants.map((t) => t._id) } }).lean()).map((p) => [String(p.user), p]));
  return tenants
    .map((t) => ({ t, p: profiles.get(String(t._id)) }))
    .filter(({ p }) => !query.propertyId || String(p?.property) === String(query.propertyId))
    .map(({ t, p }) => ({
      name: name(t), email: t.email,
      phone: t.preferences?.privacy?.showPhoneToLandlord === false ? '(hidden by tenant)' : (t.phone || ''),
      account: t.status, residency: p?.status || 'pre_added',
      property: sc.propName.get(String(p?.property)) || '', unit: sc.unitLabel.get(String(p?.unit)) || '',
      monthlyRent: round(p?.monthlyRent), leaseStart: day(p?.leaseStart), leaseEnd: day(p?.leaseEnd), securityDeposit: round(p?.securityDeposit),
    }));
}

export async function maintenanceRows(landlordId, query = {}) {
  const sc = await scope(landlordId, query);
  const range = monthRange(query.month);
  const filter = { unit: { $in: sc.units.map((u) => u._id) } };
  if (range) filter.createdAt = { $gte: range.start, $lt: range.end };
  const tickets = await Ticket.find(filter).populate('tenant', 'firstName lastName email').sort({ createdAt: -1 }).lean();
  const unitProp = new Map(sc.units.map((u) => [String(u._id), String(u.property)]));
  return tickets.map((t) => {
    const closed = (t.statusHistory || []).filter((h) => ['resolved', 'closed'].includes(h.status)).map((h) => h.timestamp).sort().pop();
    return {
      reference: String(t._id).slice(-6).toUpperCase(), title: t.title, category: t.category, priority: t.priority, status: t.status,
      property: sc.propName.get(unitProp.get(String(t.unit))) || '', unit: sc.unitLabel.get(String(t.unit)) || '', tenant: name(t.tenant),
      technician: t.assignedTechnician?.name || '', opened: day(t.createdAt), resolved: day(closed),
    };
  });
}

export async function utilityBillRows(landlordId, query = {}) {
  const sc = await scope(landlordId, query);
  const filter = { landlord: landlordId, property: { $in: sc.ids } };
  if (query.month) { monthRange(query.month); filter.periodKey = query.month; }
  const bills = await UtilityBill.find(filter).sort({ periodKey: -1 }).lean();
  const rows = [];
  for (const b of bills) {
    for (const a of b.allocations || []) {
      rows.push({
        month: b.periodKey, property: sc.propName.get(String(b.property)) || '', utility: b.utilityType, billTotal: round(b.totalAmount),
        sourceReference: b.sourceReference || '', split: b.splitMethod === 'by_share' ? 'By share' : 'Equal', billStatus: b.status,
        unit: a.unitLabel || sc.unitLabel.get(String(a.unit)) || '', unitAmount: round(a.amount), invoiced: a.payment ? 'Yes' : 'No', dueDate: day(b.dueDate),
      });
    }
  }
  return rows;
}

const COLUMNS = {
  'rent-roll': [['property', 'Property'], ['unit', 'Unit'], ['tenant', 'Tenant'], ['period', 'Period'], ['type', 'Type'], ['dueDate', 'Due date'], ['billed', 'Billed (PHP)'], ['paid', 'Paid (PHP)'], ['outstanding', 'Outstanding (PHP)'], ['status', 'Status'], ['lastPaymentDate', 'Last payment'], ['methods', 'Method'], ['references', 'Reference'], ['receiptNumber', 'Receipt no.']],
  'income-summary': [['property', 'Property'], ['rentBilled', 'Rent billed'], ['rentCollected', 'Rent collected'], ['rentOutstanding', 'Rent outstanding'], ['utilitiesBilled', 'Utilities billed'], ['utilitiesCollected', 'Utilities collected'], ['utilitiesOutstanding', 'Utilities outstanding'], ['collectedInMonth', 'Cash received in month']],
  tenants: [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['account', 'Account'], ['residency', 'Residency'], ['property', 'Property'], ['unit', 'Unit'], ['monthlyRent', 'Monthly rent (PHP)'], ['leaseStart', 'Lease start'], ['leaseEnd', 'Lease end'], ['securityDeposit', 'Deposit (PHP)']],
  maintenance: [['reference', 'Ref'], ['title', 'Title'], ['category', 'Category'], ['priority', 'Priority'], ['status', 'Status'], ['property', 'Property'], ['unit', 'Unit'], ['tenant', 'Tenant'], ['technician', 'Technician'], ['opened', 'Opened'], ['resolved', 'Resolved']],
  'utility-bills': [['month', 'Month'], ['property', 'Property'], ['utility', 'Utility'], ['billTotal', 'Bill total (PHP)'], ['sourceReference', 'Bill reference'], ['split', 'Split'], ['billStatus', 'Bill status'], ['unit', 'Unit'], ['unitAmount', 'Unit share (PHP)'], ['invoiced', 'Invoiced'], ['dueDate', 'Due date']],
};

/** Build a CSV export by report key. */
export async function exportCsv(landlordId, report, query = {}) {
  const cols = COLUMNS[report];
  if (!cols) throw new ReportError('Unknown report.', 404);
  let rows;
  if (report === 'rent-roll') rows = await rentRollRows(landlordId, query);
  else if (report === 'income-summary') {
    const s = await incomeSummary(landlordId, query);
    rows = [...s.rows, { property: 'TOTAL', ...s.totals }];
  } else if (report === 'tenants') rows = await tenantRows(landlordId, query);
  else if (report === 'maintenance') rows = await maintenanceRows(landlordId, query);
  else rows = await utilityBillRows(landlordId, query);
  const suffix = [query.month, query.propertyId ? 'property' : 'all'].filter(Boolean).join('-');
  return { filename: `jptl-${report}-${suffix || 'all'}.csv`, csv: toCsv(cols.map(([, h]) => h), rows.map((r) => cols.map(([k]) => r[k]))), count: rows.length };
}
