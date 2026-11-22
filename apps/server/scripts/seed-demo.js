/**
 * Fresh demo data (Philippines, PHP, Asia/Manila) covering current features:
 * landlord + Property Manager + Technician, five properties, occupied and
 * vacant units, active / ending-soon / pre-added tenants, paid / partial /
 * overdue / in-review rent, a shared-water property billed from actual bills,
 * maintenance tickets, and announcements.
 *
 * Expects an empty (reset) database. Refuses to run if any landlord exists.
 *   SEED_DEMO_CONFIRM=1 node scripts/seed-demo.js --execute
 * All demo accounts use the password Password123!
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/shared/models/user.model.js';
import Property from '../src/shared/models/property.model.js';
import Unit from '../src/shared/models/unit.model.js';
import TenantProfile from '../src/shared/models/tenantProfile.model.js';
import Lease from '../src/shared/models/lease.model.js';
import Payment from '../src/shared/models/payment.model.js';
import Ticket from '../src/shared/models/ticket.model.js';
import Announcement from '../src/shared/models/announcements.model.js';

const PASSWORD = 'Password123!';
const d = (iso) => new Date(`${iso}T00:00:00.000Z`); // calendar date, UTC midnight

if (!process.argv.includes('--execute') || process.env.SEED_DEMO_CONFIRM !== '1') {
  console.log('Dry run. Set SEED_DEMO_CONFIRM=1 and pass --execute to write demo data.');
  process.exit(0);
}

await mongoose.connect(process.env.MONGO_URI);
try {
  if (await User.exists({ role: 'landlord' })) throw new Error('Landlord accounts already exist. Reset the database first.');

  // ── People ────────────────────────────────────────────────────────────────
  const landlord = await User.create({
    firstName: 'Alexander', lastName: 'Vance', email: 'landlord@jptl.dev', phone: '09171234500',
    password: PASSWORD, role: 'landlord', plan: 'pro', onboardingCompleted: true, status: 'active',
    company: 'Vance Realty Holdings', timezone: 'Asia/Manila',
    preferences: { currency: 'PHP', timezone: 'Asia/Manila', alerts: { newTicket: true, overduePayment: true, leaseExpiration: true, dailySummaryEmail: false } },
  });

  const props = await Property.insertMany([
    { name: 'Aura Sky Towers & Residences', address: '88 Ayala Avenue', city: 'Makati City', category: 'Luxury', petsAllowed: true, parkingAvailable: true },
    { name: 'Vantro Executive Lofts', address: '204 5th Avenue, Bonifacio Global City', city: 'Taguig City', category: 'Studio', parkingAvailable: true },
    { name: 'Solis Villa Estate', address: '12 Acacia Drive, Ayala Alabang', city: 'Muntinlupa City', category: 'Residential', petsAllowed: true, parkingAvailable: true },
    { name: 'Lumina Green Park Apartments', address: '45 Maginhawa Street, Teachers Village', city: 'Quezon City', category: 'Residential' },
    { name: 'Nexus Commercial Center', address: '150 ADB Avenue, Ortigas Center', city: 'Pasig City', category: 'Commercial', parkingAvailable: true },
  ].map((p) => ({ ...p, landlord: landlord._id, timezone: 'Asia/Manila', renewalWindowDays: 60, status: 'active' })));
  const [aura, vantro, solis, lumina, nexus] = props;

  const staffPm = await User.create({
    firstName: 'Maria', lastName: 'Santos', email: 'pm@jptl.dev', phone: '09171234501', password: PASSWORD,
    role: 'staff', staffType: 'property_manager', landlord: landlord._id, propertyAssignments: [aura._id, lumina._id], status: 'active',
  });
  const staffTech = await User.create({
    firstName: 'Ramon', lastName: 'Cruz', email: 'tech@jptl.dev', phone: '09171234502', password: PASSWORD,
    role: 'staff', staffType: 'technician', landlord: landlord._id, propertyAssignments: [aura._id, vantro._id, lumina._id], status: 'active',
  });

  const tenantDefs = [
    { key: 'sophia', firstName: 'Sophia', lastName: 'Lim', email: 'sophia@jptl.dev', phone: '09181110001' },
    { key: 'liam', firstName: 'Liam', lastName: 'Carter', email: 'liam@jptl.dev', phone: '09181110002' },
    { key: 'david', firstName: 'David', lastName: 'Mercado', email: 'david@jptl.dev', phone: '09181110003' },
    { key: 'miguel', firstName: 'Miguel', lastName: 'Reyes', email: 'miguel@jptl.dev', phone: '09181110004' },
    { key: 'ana', firstName: 'Ana', lastName: 'Dela Cruz', email: 'ana@jptl.dev', phone: '09181110005' },
    { key: 'elena', firstName: 'Elena', lastName: 'Rostova', email: 'elena@jptl.dev', phone: '09181110006' },
  ];
  const tenants = {};
  for (const t of tenantDefs) {
    tenants[t.key] = await User.create({
      firstName: t.firstName, lastName: t.lastName, email: t.email, phone: t.phone, password: PASSWORD,
      role: 'tenant', landlord: landlord._id, status: 'active', timezone: 'Asia/Manila',
      emergencyContact: { name: `${t.key === 'elena' ? '' : 'Rosa ' + t.lastName}`, relationship: t.key === 'elena' ? '' : 'Mother', phone: t.key === 'elena' ? '' : '09190000000' },
      preferences: { privacy: { showPhoneToLandlord: true, showEmergencyContactToLandlord: true, showVehiclesToLandlord: true, vendorDataSharing: true } },
    });
  }

  // ── Units ─────────────────────────────────────────────────────────────────
  const water = (chargeMode, monthlyShare = 1) => [{ utilityType: 'water', billingMode: 'shared_meter', chargeMode, monthlyShare }];
  const unitRows = [
    { key: 'aura14b', property: aura, label: 'Unit 14B', monthlyRent: 45000, bedrooms: 2, bathrooms: 2, sqft: 85, hasParking: true, parkingSpot: 'B2-14', parkingFee: 5000, tenant: 'sophia', leaseStart: '2026-01-15', leaseEnd: '2027-01-14' },
    { key: 'aura18a', property: aura, label: 'Unit 18A Penthouse', monthlyRent: 85000, bedrooms: 3, bathrooms: 3, sqft: 160 },
    { key: 'aura09c', property: aura, label: 'Unit 9C', monthlyRent: 38000, bedrooms: 1, bathrooms: 1, sqft: 55 },
    { key: 'vantro304', property: vantro, label: 'Loft 304', monthlyRent: 32000, bedrooms: 1, bathrooms: 1, sqft: 48, tenant: 'liam', leaseStart: '2026-06-01', leaseEnd: '2027-05-31' },
    { key: 'vantro305', property: vantro, label: 'Loft 305', monthlyRent: 32000, bedrooms: 1, bathrooms: 1, sqft: 48 },
    { key: 'solis04', property: solis, label: 'Villa 04', monthlyRent: 75000, bedrooms: 4, bathrooms: 3, sqft: 240, hasParking: true, parkingSpot: 'Driveway 4', parkingFee: 0, tenant: 'david', leaseStart: '2026-03-01', leaseEnd: '2027-02-28' },
    { key: 'lumina2a', property: lumina, label: 'Apt 2A', monthlyRent: 18000, bedrooms: 1, bathrooms: 1, sqft: 32, tenant: 'miguel', leaseStart: '2025-12-01', leaseEnd: '2026-12-31', utilityBilling: water('actual_bill', 1) },
    { key: 'lumina2b', property: lumina, label: 'Apt 2B', monthlyRent: 22000, bedrooms: 2, bathrooms: 1, sqft: 45, tenant: 'ana', leaseStart: '2026-02-01', leaseEnd: '2027-01-31', utilityBilling: water('actual_bill', 1.5) },
    { key: 'lumina3a', property: lumina, label: 'Apt 3A', monthlyRent: 18000, bedrooms: 1, bathrooms: 1, sqft: 32, utilityBilling: water('actual_bill', 1) },
    { key: 'nexus501', property: nexus, label: 'Office Suite 501', monthlyRent: 120000, bedrooms: 0, bathrooms: 2, sqft: 200, hasParking: true, parkingSpot: 'P3-C12', parkingFee: 6000 },
  ];
  const units = {};
  for (const u of unitRows) {
    units[u.key] = await Unit.create({
      property: u.property._id, label: u.label, monthlyRent: u.monthlyRent, bedrooms: u.bedrooms, bathrooms: u.bathrooms, sqft: u.sqft,
      hasParking: Boolean(u.hasParking), parkingSpot: u.parkingSpot || null, parkingFee: u.parkingFee || 0, utilityBilling: u.utilityBilling || [],
      tenant: u.tenant ? tenants[u.tenant]._id : null, status: u.tenant ? 'occupied' : 'vacant',
      leaseStart: u.leaseStart ? d(u.leaseStart) : null, leaseType: 'fixed_term', leaseEnd: u.leaseEnd ? d(u.leaseEnd) : null,
    });
  }
  for (const p of props) {
    const all = unitRows.filter((u) => u.property === p);
    const occupied = all.filter((u) => u.tenant).length;
    await Property.updateOne({ _id: p._id }, { $set: { unitsCount: all.length, occupancyRate: all.length ? Math.round((occupied / all.length) * 100) : 0 } });
  }

  // ── Tenancies ─────────────────────────────────────────────────────────────
  const leases = {};
  for (const u of unitRows.filter((row) => row.tenant)) {
    const tenant = tenants[u.tenant];
    const common = { property: u.property._id, unit: units[u.key]._id, monthlyRent: u.monthlyRent, hasParking: Boolean(u.hasParking), parkingSpot: u.parkingSpot || null, parkingFee: u.parkingFee || 0, securityDeposit: u.monthlyRent * 2, leaseStart: d(u.leaseStart), leaseType: 'fixed_term', leaseEnd: d(u.leaseEnd) };
    await TenantProfile.create({ user: tenant._id, landlord: landlord._id, status: 'active', ...common });
    leases[u.tenant] = await Lease.create({ tenant: tenant._id, landlord: landlord._id, status: 'active', contractPdfUrl: null, covenants: [], ...common });
  }
  await TenantProfile.create({ user: tenants.elena._id, landlord: landlord._id, status: 'pre_added', property: null, unit: null, monthlyRent: 0 });

  // ── Rent invoices ─────────────────────────────────────────────────────────
  const rentFor = (key) => unitRows.find((u) => u.tenant === key);
  const invoice = async (key, { month, due, status, paid = 0, channel = 'bank_transfer', review = null, submitted = null }) => {
    const u = rentFor(key);
    const amount = u.monthlyRent + (u.parkingFee || 0);
    const allocations = paid > 0 ? [{ amount: paid, channel, confirmedAt: d(due), confirmedBy: landlord._id, reference: `TRX-${key.toUpperCase()}-${month.replace(' ', '')}` }] : [];
    return Payment.create({
      tenant: tenants[key]._id, unit: units[u.key]._id, property: u.property._id,
      amount, baseRent: u.monthlyRent, parkingFee: u.parkingFee || 0, utilityFee: 0,
      dueDate: d(due), period: `Rent Due ${month}`, status, paidAmount: paid, paymentAllocations: allocations,
      paidAt: status === 'paid' ? d(due) : null, paymentChannel: paid > 0 || review ? channel : null,
      paymentMethod: paid > 0 ? 'Bank Transfer' : null, receiptNumber: status === 'paid' ? `RCP-${key.toUpperCase()}-${month.slice(0, 3).toUpperCase()}` : null,
      reviewStatus: review, submittedAmount: submitted, submittedAt: review ? d('2026-11-05') : null, tenantPaymentNote: review ? 'Paid cash to the admin office.' : '',
    });
  };
  for (const key of ['sophia', 'liam', 'david', 'miguel', 'ana']) {
    const u = rentFor(key);
    await invoice(key, { month: 'October 2026', due: '2026-10-05', status: 'paid', paid: u.monthlyRent + (u.parkingFee || 0) });
  }
  await invoice('sophia', { month: 'November 2026', due: '2026-11-05', status: 'paid', paid: 50000 });
  await invoice('liam', { month: 'November 2026', due: '2026-11-05', status: 'partially_paid', paid: 20000 });
  await invoice('david', { month: 'November 2026', due: '2026-11-05', status: 'pending', channel: 'onsite', review: 'pending_review', submitted: 75000 });
  await invoice('miguel', { month: 'November 2026', due: '2026-11-05', status: 'pending' }); // overdue by date
  await invoice('ana', { month: 'November 2026', due: '2026-11-25', status: 'pending' }); // due soon

  // ── Maintenance ───────────────────────────────────────────────────────────
  await Ticket.create([
    { title: 'Aircon not cooling', description: 'The bedroom split-type aircon blows warm air since yesterday.', category: 'HVAC', priority: 'high', status: 'in_progress', tenant: tenants.sophia._id, unit: units.aura14b._id, assignedStaff: staffTech._id, assignedTechnician: { name: 'Ramon Cruz', phone: '09171234502', company: 'JPTL Technician', eta: 'Today, 3:00 PM' }, entryPreference: 'ok_if_not_home' },
    { title: 'Leaking kitchen faucet', description: 'Constant drip from the kitchen faucet, worse at night.', category: 'Plumbing', priority: 'medium', status: 'submitted', tenant: tenants.miguel._id, unit: units.lumina2a._id, entryPreference: 'must_be_present' },
    { title: 'Hallway light flickering', description: 'The light outside Loft 304 flickers on and off.', category: 'Electrical', priority: 'low', status: 'resolved', tenant: tenants.liam._id, unit: units.vantro304._id, assignedStaff: staffTech._id, assignedTechnician: { name: 'Ramon Cruz', phone: '09171234502', company: 'JPTL Technician', eta: '' } },
  ]);

  // ── Announcements ─────────────────────────────────────────────────────────
  await Announcement.create([
    { title: 'Water interruption on Saturday', content: 'Maynilad will cut water supply from 9:00 AM to 3:00 PM this Saturday for line repairs. Please store water ahead of time.', category: 'Maintenance', author: landlord._id, property: lumina._id },
    { title: 'Elevator maintenance', content: 'Elevator B will be under maintenance on Tuesday from 1:00 PM to 4:00 PM. Please use Elevator A.', category: 'Maintenance', author: landlord._id, property: aura._id },
    { title: 'Welcome to JPTL', content: 'You can now pay rent, file maintenance requests, and message the property office from your portal.', category: 'General', author: landlord._id, property: null },
  ]);

  console.log('Demo data created. Password for every account: Password123!');
  console.log(`  landlord  ${landlord.email}`);
  console.log(`  staff     ${staffPm.email} (property manager), ${staffTech.email} (technician)`);
  console.log(`  tenants   ${tenantDefs.map((t) => t.email).join(', ')}`);
} finally {
  await mongoose.disconnect();
}
