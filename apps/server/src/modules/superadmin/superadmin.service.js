import Property from '../../shared/models/property.model.js';
import Unit from '../../shared/models/unit.model.js';
import User from '../../shared/models/user.model.js';
import SessionLog from '../../shared/models/sessionLog.model.js';
import AuditLog from '../../shared/models/auditLog.model.js';
import Lease from '../../shared/models/lease.model.js';

// ═════════════════════════════════════════════════
// PROPERTIES CRUD
// ═════════════════════════════════════════════════

export async function getAllProperties({ search = '', category = '', status = '' } = {}) {
  const query = {};
  if (category) query.category = category;
  if (status && status !== 'all') query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
      { city: { $regex: search, $options: 'i' } },
    ];
  }

  const properties = await Property.find(query)
    .populate('landlord', 'firstName lastName email phone')
    .sort({ createdAt: -1 });

  return properties;
}

export async function getPropertyById(id) {
  const property = await Property.findById(id).populate('landlord', 'firstName lastName email phone');
  if (!property) {
    const error = new Error('Property not found');
    error.statusCode = 404;
    throw error;
  }
  return property;
}

export async function createProperty(data) {
  const { name, address, city, category, landlord, unitsCount, buildingRules, accessCodes } = data;

  if (!name || !address || !city || !landlord) {
    const error = new Error('Name, address, city, and landlord are required');
    error.statusCode = 400;
    throw error;
  }

  // Verify landlord exists
  const landlordUser = await User.findById(landlord);
  if (!landlordUser || landlordUser.role !== 'landlord' || landlordUser.status !== 'active') {
    const error = new Error('Designated landlord user not found');
    error.statusCode = 400;
    throw error;
  }

  const property = await Property.create({
    name: name.trim(),
    address: address.trim(),
    city: city.trim(),
    category: category || 'Residential',
    landlord,
    unitsCount: Number(unitsCount) || 0,
    buildingRules: buildingRules || [],
    accessCodes: accessCodes || {},
  });

  return property.populate('landlord', 'firstName lastName email phone');
}

export async function updateProperty(id, data) {
  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.statusCode = 404;
    throw error;
  }

  if (data.landlord) {
    const landlord = await User.findById(data.landlord).select('role status');
    if (!landlord || landlord.role !== 'landlord' || landlord.status !== 'active') {
      const error = new Error('Select an active landlord account');
      error.statusCode = 400;
      throw error;
    }
  }

  const allowedUpdates = [
    'name',
    'address',
    'city',
    'category',
    'image',
    'featured',
    'accessCodes',
    'buildingRules',
    'landlord',
    'unitsCount',
    'occupancyRate',
  ];

  for (const key of allowedUpdates) {
    if (data[key] !== undefined) {
      property[key] = data[key];
    }
  }

  await property.save();
  return property.populate('landlord', 'firstName lastName email phone');
}

export async function deleteProperty(id, actorId, ipAddress = '') {
  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.statusCode = 404;
    throw error;
  }

  const unitCount = await Unit.countDocuments({ property: id });
  if (unitCount) {
    throw Object.assign(new Error(`Cannot permanently delete this property while it still has ${unitCount} unit(s). Delete eligible units first.`), { statusCode: 409 });
  }

  await AuditLog.create({ actor: actorId, actorRole: 'superadmin', action: 'PROPERTY_DELETED', entityKind: 'Property', entityId: property._id, ipAddress });
  await property.deleteOne();

  return { message: 'Property deleted successfully' };
}

export async function setPropertyActive(id, active, actorId, reason = '', ipAddress = '') {
  const property = await Property.findById(id);
  if (!property) throw Object.assign(new Error('Property not found'), { statusCode: 404 });
  if (!active) {
    const propertyUnits = await Unit.find({ property: id }).select('_id').lean();
    const unitIds = propertyUnits.map((unit) => unit._id);
    const [occupiedCount, activeLeaseCount] = await Promise.all([
      Unit.countDocuments({ _id: { $in: unitIds }, $or: [{ tenant: { $ne: null } }, { status: 'occupied' }] }),
      Lease.countDocuments({ unit: { $in: unitIds }, status: { $in: ['active', 'renewal_pending', 'renewal_approved'] } }),
    ]);
    if (occupiedCount || activeLeaseCount) throw Object.assign(new Error(`Cannot deactivate this property while it has ${occupiedCount} occupied unit(s) and ${activeLeaseCount} active lease(s). Complete move-out or lease closure first.`), { statusCode: 409 });
  }
  property.status = active ? 'active' : 'inactive';
  await property.save();
  await AuditLog.create({ actor: actorId, actorRole: 'superadmin', action: active ? 'PROPERTY_REACTIVATED' : 'PROPERTY_DEACTIVATED', entityKind: 'Property', entityId: property._id, reason: String(reason || '').trim().slice(0, 250), ipAddress });
  return property;
}

// ═════════════════════════════════════════════════
// UNITS CRUD
// ═════════════════════════════════════════════════

export async function getAllUnits({ search = '', propertyId = '', status = '', active = '' } = {}) {
  const query = {};
  if (propertyId) query.property = propertyId;
  if (status) query.status = status;
  if (active === 'true') query.isActive = true;
  if (active === 'false') query.isActive = false;
  if (search) {
    query.label = { $regex: search, $options: 'i' };
  }

  const units = await Unit.find(query)
    .populate('property', 'name address city')
    .populate('tenant', 'firstName lastName email phone')
    .sort({ createdAt: -1 });

  return units;
}

export async function getUnitById(id) {
  const unit = await Unit.findById(id)
    .populate('property', 'name address city')
    .populate('tenant', 'firstName lastName email phone');

  if (!unit) {
    const error = new Error('Unit not found');
    error.statusCode = 404;
    throw error;
  }
  return unit;
}

export async function createUnit(data) {
  const {
    label,
    property,
    monthlyRent,
    sqft,
    bedrooms = 0,
    bathrooms = 1,
    status = 'vacant',
    hasParking = false,
    parkingSpot = null,
    parkingFee = 0,
    tenant = null,
  } = data;

  const rent = monthlyRent !== undefined ? monthlyRent : data.rentAmount;
  const unitSqft = sqft !== undefined ? sqft : 500;

  if (!label || !property || rent === undefined) {
    const error = new Error('Label, property, and monthlyRent are required');
    error.statusCode = 400;
    throw error;
  }

  // Verify property exists
  const propDoc = await Property.findById(property);
  if (!propDoc || propDoc.status === 'inactive') {
    const error = new Error('Parent property not found');
    error.statusCode = 400;
    throw error;
  }

  const unit = await Unit.create({
    label: label.trim(),
    property,
    monthlyRent: Number(rent),
    sqft: Number(unitSqft),
    bedrooms: Number(bedrooms),
    bathrooms: Number(bathrooms),
    status,
    hasParking: Boolean(hasParking),
    parkingSpot: parkingSpot ? parkingSpot.trim() : null,
    parkingFee: Number(parkingFee) || 0,
    tenant: tenant || null,
  });

  // Update property units count
  const count = await Unit.countDocuments({ property });
  propDoc.unitsCount = count;
  await propDoc.save();

  return unit.populate([
    { path: 'property', select: 'name address city' },
    { path: 'tenant', select: 'firstName lastName email phone' },
  ]);
}

export async function updateUnit(id, data) {
  const unit = await Unit.findById(id);
  if (!unit) {
    const error = new Error('Unit not found');
    error.statusCode = 404;
    throw error;
  }

  if (data.tenant || data.property) {
    const property = await Property.findById(data.property || unit.property).select('status');
    if ((data.tenant && !unit.isActive) || property?.status === 'inactive') {
      const error = new Error('Cannot assign a tenant or move a unit to an inactive property');
      error.statusCode = 409;
      throw error;
    }
  }

  const allowedUpdates = [
    'label',
    'property',
    'monthlyRent',
    'sqft',
    'bedrooms',
    'bathrooms',
    'status',
    'hasParking',
    'parkingSpot',
    'parkingFee',
    'tenant',
    'leaseStart',
    'leaseEnd',
  ];

  for (const key of allowedUpdates) {
    if (data[key] !== undefined) {
      unit[key] = data[key];
    }
  }

  await unit.save();

  return unit.populate([
    { path: 'property', select: 'name address city' },
    { path: 'tenant', select: 'firstName lastName email phone' },
  ]);
}

export async function deleteUnit(id, actorId, ipAddress = '') {
  const unit = await Unit.findById(id);
  if (!unit) {
    const error = new Error('Unit not found');
    error.statusCode = 404;
    throw error;
  }

  if (unit.tenant || unit.status === 'occupied') {
    throw Object.assign(new Error('Cannot permanently delete an assigned or occupied unit. Move out or unassign the tenant first.'), { statusCode: 409 });
  }
  if (await Lease.exists({ unit: id })) {
    throw Object.assign(new Error('Cannot permanently delete a unit with lease history. Deactivate it to preserve its records.'), { statusCode: 409 });
  }

  const propertyId = unit.property;
  await AuditLog.create({ actor: actorId, actorRole: 'superadmin', action: 'UNIT_DELETED', entityKind: 'Unit', entityId: unit._id, ipAddress });
  await unit.deleteOne();

  // Update property unitsCount
  if (propertyId) {
    const count = await Unit.countDocuments({ property: propertyId });
    await Property.findByIdAndUpdate(propertyId, { unitsCount: count });
  }

  return { message: 'Unit deleted successfully' };
}

export async function setUnitActive(id, active, actorId, reason = '', ipAddress = '') {
  const unit = await Unit.findById(id);
  if (!unit) throw Object.assign(new Error('Unit not found'), { statusCode: 404 });
  if (!active && (unit.tenant || unit.status === 'occupied')) {
    throw Object.assign(new Error('Cannot deactivate an assigned or occupied unit. Move out or unassign the resident first.'), { statusCode: 409 });
  }
  if (!active && await Lease.exists({ unit: id, status: { $in: ['active', 'renewal_pending', 'renewal_approved'] } })) {
    throw Object.assign(new Error('Cannot deactivate a unit with an active lease. Complete move-out or close the lease first.'), { statusCode: 409 });
  }
  unit.isActive = Boolean(active);
  await unit.save();
  await AuditLog.create({ actor: actorId, actorRole: 'superadmin', action: active ? 'UNIT_REACTIVATED' : 'UNIT_DEACTIVATED', entityKind: 'Unit', entityId: unit._id, reason: String(reason || '').trim().slice(0, 250), ipAddress });
  return unit;
}

// ═════════════════════════════════════════════════
// SESSIONS & LIVE MONITORING
// ═════════════════════════════════════════════════

export async function getSessionLogs({ limit = 50, page = 1, role = '', search = '' } = {}) {
  const query = {};
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { ip: { $regex: search, $options: 'i' } },
    ];
  }

  const safeLimit = Math.min(Number(limit) || 50, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  const [total, sessions] = await Promise.all([
    SessionLog.countDocuments(query),
    SessionLog.find(query)
      .populate('userId', 'firstName lastName email role')
      .sort({ loginAt: -1 })
      .skip(skip)
      .limit(safeLimit),
  ]);

  const activeCount = await SessionLog.countDocuments({ isActive: true });

  return {
    total,
    page: Number(page) || 1,
    limit: safeLimit,
    activeCount,
    sessions,
  };
}

export async function getLandlordsAndTenants() {
  const users = await User.find(
    { role: { $in: ['landlord', 'tenant'] }, status: 'active' },
    'firstName lastName email role'
  ).sort({ firstName: 1 });

  return {
    landlords: users.filter((u) => u.role === 'landlord'),
    tenants: users.filter((u) => u.role === 'tenant'),
  };
}

// ═════════════════════════════════════════════════
// USERS CRUD (LANDLORDS & TENANTS)
// ═════════════════════════════════════════════════

export async function getAllUsers({ role = '', search = '', status = '' } = {}) {
  const query = {};
  if (role && role !== 'all') query.role = role;
  if (status && status !== 'all') query.status = status;
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(query)
    .populate('landlord', 'firstName lastName email')
    .sort({ createdAt: -1 });

  return users;
}

export async function getUserById(id) {
  const user = await User.findById(id).populate('landlord', 'firstName lastName email');
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  return user;
}

export async function createUser(data) {
  const { firstName, middleName = '', lastName, email, phone = '', password, role = 'landlord', plan = 'starter', landlord = null } = data;

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    const error = new Error('First name, last name, email, and password are required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    const error = new Error('Email is already registered');
    error.statusCode = 409;
    throw error;
  }

  const user = await User.create({
    firstName: firstName.trim(),
    middleName: middleName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    phone: phone.trim(),
    password,
    role,
    plan,
    landlord: landlord || null,
    onboardingCompleted: true,
    status: 'active',
  });

  return user.populate('landlord', 'firstName lastName email');
}

export async function updateUser(id, data) {
  const user = await User.findById(id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const allowedUpdates = [
    'firstName',
    'middleName',
    'lastName',
    'email',
    'phone',
    'role',
    'plan',
    'landlord',
    'onboardingCompleted',
  ];

  for (const key of allowedUpdates) {
    if (data[key] !== undefined) {
      user[key] = data[key];
    }
  }

  if (data.password && data.password.trim()) {
    user.password = data.password.trim();
  }

  await user.save();
  return user.populate('landlord', 'firstName lastName email');
}

export async function setUserActive(id, active, actorId, reason = '', ipAddress = '') {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  user.status = active ? 'active' : 'suspended';
  await user.save();
  if (!active) await SessionLog.updateMany({ userId: id, isActive: true }, { isActive: false, logoutAt: new Date() });
  await AuditLog.create({ actor: actorId, actorRole: 'superadmin', action: active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', entityKind: 'User', entityId: user._id, reason: String(reason || '').trim().slice(0, 250), ipAddress });
  return user.populate('landlord', 'firstName lastName email');
}

export async function deleteUser(id, actorId, ipAddress = '') {
  const user = await User.findById(id);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  if (user.role === 'superadmin') {
    throw Object.assign(new Error('Superadmin accounts cannot be permanently deleted here.'), { statusCode: 409 });
  }
  const [ownedProperty, assignedUnit, leaseHistory] = await Promise.all([
    Property.exists({ landlord: id }),
    Unit.exists({ tenant: id }),
    Lease.exists({ $or: [{ tenant: id }, { landlord: id }] }),
  ]);
  if (ownedProperty || assignedUnit || leaseHistory) {
    throw Object.assign(new Error('Cannot permanently delete this account while it is linked to properties, units, or lease history. Deactivate it to preserve those records.'), { statusCode: 409 });
  }

  await AuditLog.create({ actor: actorId, actorRole: 'superadmin', action: 'USER_DELETED', entityKind: 'User', entityId: user._id, ipAddress });
  await SessionLog.updateMany({ userId: id }, { isActive: false, logoutAt: new Date() });
  await user.deleteOne();
  return { message: 'User deleted successfully' };
}


// ═════════════════════════════════════════════════
// AUDIT TRAIL
// ═════════════════════════════════════════════════

export async function getAuditLogs({
  page = 1, limit = 50, actorRole = '', action = '',
  entityKind = '', search = '', startDate = '', endDate = '',
} = {}) {
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;
  const filter = {};
  if (actorRole) filter.actorRole = actorRole;
  if (action) filter.action = { $regex: action, $options: 'i' };
  if (entityKind) filter.entityKind = entityKind;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const [total, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .populate('actor', 'firstName middleName lastName email role')
      .sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
  ]);

  let formatted = logs.map((log) => ({
    id: log._id,
    timestamp: log.createdAt,
    actor: log.actor
      ? { id: log.actor._id, name: [log.actor.firstName, log.actor.middleName, log.actor.lastName].filter(Boolean).join(' '), email: log.actor.email, role: log.actor.role }
      : null,
    actorRole: log.actorRole,
    action: log.action,
    reason: log.reason || '',
    entityKind: log.entityKind,
    entityId: log.entityId,
    ipAddress: log.ipAddress || '',
  }));

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    formatted = formatted.filter((l) =>
      l.actor?.name?.toLowerCase().includes(q) ||
      l.actor?.email?.toLowerCase().includes(q) ||
      l.action?.toLowerCase().includes(q) ||
      l.entityKind?.toLowerCase().includes(q)
    );
  }

  return { total, page: Number(page) || 1, limit: safeLimit, logs: formatted };
}

export async function exportAuditLogsCsv(filters = {}) {
  const { logs } = await getAuditLogs({ ...filters, page: 1, limit: 5000 });
  const headers = ['Timestamp', 'Actor Name', 'Actor Email', 'Role', 'Action', 'Entity Type', 'Entity ID', 'IP Address'];
  const csvLines = [headers.join(',')];
  for (const log of logs) {
    csvLines.push([
      `"${new Date(log.timestamp).toISOString()}"`,
      `"${log.actor?.name || ''}"`,
      `"${log.actor?.email || ''}"`,
      `"${log.actorRole}"`,
      `"${log.action}"`,
      `"${log.entityKind}"`,
      `"${log.entityId || ''}"`,
      `"${log.ipAddress}"`,
    ].join(','));
  }
  return { filename: `Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`, csv: csvLines.join('\n'), count: logs.length };
}

export async function exportSessionLogsCsv({ role = '', search = '' } = {}) {
  const filter = {};
  if (role) filter.role = role;
  if (search) filter.$or = [{ email: { $regex: search, $options: 'i' } }, { ip: { $regex: search, $options: 'i' } }];

  const sessions = await SessionLog.find(filter).sort({ loginAt: -1 }).limit(5000).lean();
  const headers = ['Login At', 'Logout At', 'Duration (min)', 'Email', 'Role', 'IP', 'User Agent', 'Status'];
  const csvLines = [headers.join(',')];
  for (const s of sessions) {
    const loginAt = s.loginAt ? new Date(s.loginAt) : null;
    const logoutAt = s.logoutAt ? new Date(s.logoutAt) : null;
    const durationMin = loginAt && logoutAt ? Math.round((logoutAt - loginAt) / 60000) : '';
    csvLines.push([
      `"${loginAt ? loginAt.toISOString() : ''}"`,
      `"${logoutAt ? logoutAt.toISOString() : ''}"`,
      `"${durationMin}"`,
      `"${s.email}"`,
      `"${s.role}"`,
      `"${s.ip}"`,
      `"${(s.userAgent || '').replace(/"/g, "'")}"`,
      `"${s.isActive ? 'Active' : 'Ended'}"`,
    ].join(','));
  }
  return { filename: `Session_Logs_${new Date().toISOString().slice(0, 10)}.csv`, csv: csvLines.join('\n'), count: sessions.length };
}
