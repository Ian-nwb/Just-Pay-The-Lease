import Property from '../../../shared/models/property.model.js';
import Unit from '../../../shared/models/unit.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import Lease from '../../../shared/models/lease.model.js';
import User from '../../../shared/models/user.model.js';
import { assertCanAddToLandlordPlan } from '../../../shared/services/planEntitlements.service.js';
import { getCloudinaryClient } from '../../../shared/config/cloudinary.js';

export class PropertyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isValidTimezone(timezone) {
  if (typeof timezone !== 'string' || !timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

async function logAction({ actorId, action, entityKind, entityId, beforeState = null, afterState = null, ipAddress = '' }) {
  try {
    await AuditLog.create({
      actor: actorId,
      actorRole: 'landlord',
      action,
      entityKind,
      entityId,
      beforeState,
      afterState,
      ipAddress,
    });
  } catch (err) {
    console.error('Property AuditLog error:', err.message);
  }
}

/**
 * Recalculate unitsCount and occupancyRate for a property
 */
export async function updatePropertyMetrics(propertyId) {
  if (!propertyId) return;
  const units = await Unit.find({ property: propertyId }).lean();
  const total = units.length;
  const occupied = units.filter((u) => u.status === 'occupied').length;
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

  await Property.findByIdAndUpdate(propertyId, {
    unitsCount: total,
    occupancyRate,
  });
}

/**
 * GET all properties for the authenticated landlord
 */
export async function getLandlordProperties(landlordId, context = {}) {
  const properties = context.properties || (await Property.find({ landlord: landlordId }).sort({ createdAt: -1 }).lean());
  const propertyIds = context.propertyIds || properties.map((p) => p._id);

  const units = context.units || (await Unit.find({ property: { $in: propertyIds } }).lean());
  const tenantIds = units.map((unit) => unit.tenant?._id || unit.tenant).filter(Boolean);
  const tenants = context.tenants || (await User.find({ _id: { $in: tenantIds } }).select('firstName middleName lastName email').lean());
  const tenantMap = new Map(tenants.map((tenant) => [String(tenant._id || tenant.id), tenant]));
  const unitIds = units.map((unit) => unit._id);
  const activeLeases = await Lease.find({
    landlord: landlordId,
    unit: { $in: unitIds },
    status: { $in: ['active', 'renewal_pending', 'renewal_approved'] },
  }).select('unit tenant leaseStart leaseEnd leaseType').sort({ updatedAt: -1 }).lean();
  const leaseByUnit = new Map();
  for (const lease of activeLeases) if (!leaseByUnit.has(String(lease.unit))) leaseByUnit.set(String(lease.unit), lease);

  const propertiesWithUnits = properties.map((prop) => {
    const propUnits = units.filter((u) => u.property.toString() === prop._id.toString());
    const occupiedUnits = propUnits.filter((u) => u.status === 'occupied').length;
    const totalRentValue = propUnits.reduce((sum, u) => sum + (u.monthlyRent || 0), 0);

    return {
      ...prop,
      id: prop._id,
      unitsCount: propUnits.length,
      occupancyRate: propUnits.length > 0 ? Math.round((occupiedUnits / propUnits.length) * 100) : 0,
      totalRentValue,
      units: propUnits.map((u) => {
        const tenantId = u.tenant?._id || u.tenant;
        const tenant = (tenantId && typeof tenantId === 'object' && (tenantId.firstName || tenantId.email) ? tenantId : null)
          || tenantMap.get(String(tenantId))
          || null;
        const lease = leaseByUnit.get(String(u._id));
        const tenantName = tenant
          ? [tenant.firstName, tenant.middleName, tenant.lastName].filter(Boolean).join(' ').trim() || tenant.email
          : null;
        const leaseType = lease?.leaseType || u.leaseType || ((lease?.leaseEnd || u.leaseEnd) ? 'fixed_term' : 'indefinite');
        return {
          ...u,
          id: u._id,
          tenantId: tenantId ? String(tenantId) : null,
          tenantName: tenantName || u.tenantName || null,
          tenantEmail: tenant?.email || u.tenantEmail || null,
          leaseStart: lease?.leaseStart || u.leaseStart || null,
          leaseType,
          leaseEnd: leaseType === 'indefinite' ? null : lease?.leaseEnd || u.leaseEnd || null,
        };
      }),
    };
  });

  return propertiesWithUnits;
}

/**
 * GET single property by ID
 */
export async function getPropertyById(landlordId, propertyId) {
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId }).lean();
  if (!property) {
    throw new PropertyError('Property not found or access denied', 404);
  }

  const units = await Unit.find({ property: propertyId }).lean();
  const tenants = await User.find({ _id: { $in: units.map((unit) => unit.tenant).filter(Boolean) } }).select('firstName middleName lastName email').lean();
  const tenantMap = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
  const leases = await Lease.find({ landlord: landlordId, unit: { $in: units.map((unit) => unit._id) }, status: { $in: ['active', 'renewal_pending', 'renewal_approved'] } }).select('unit leaseStart leaseEnd leaseType').sort({ updatedAt: -1 }).lean();
  const leaseByUnit = new Map();
  for (const lease of leases) if (!leaseByUnit.has(String(lease.unit))) leaseByUnit.set(String(lease.unit), lease);

  return {
    ...property,
    id: property._id,
    units: units.map((u) => {
      const lease = leaseByUnit.get(String(u._id));
      const leaseType = lease?.leaseType || u.leaseType || ((lease?.leaseEnd || u.leaseEnd) ? 'fixed_term' : 'indefinite');
      return {
        ...u,
        id: u._id,
        tenantName: tenantMap.has(String(u.tenant)) ? [tenantMap.get(String(u.tenant)).firstName, tenantMap.get(String(u.tenant)).middleName, tenantMap.get(String(u.tenant)).lastName].filter(Boolean).join(' ').trim() || tenantMap.get(String(u.tenant)).email : null,
        tenantEmail: tenantMap.get(String(u.tenant))?.email || null,
        tenantId: u.tenant || null,
        leaseStart: lease?.leaseStart || u.leaseStart || null,
        leaseType,
        leaseEnd: leaseType === 'indefinite' ? null : lease?.leaseEnd || u.leaseEnd || null,
      };
    }),
  };
}

/**
 * CREATE a new property
 */
export async function createProperty(landlordId, payload, ipAddress = '') {
  const { name, address, city, category, image, timezone = 'Asia/Manila' } = payload;
  const renewalWindowDays = Number(payload.renewalWindowDays ?? 60);

  if (typeof name !== 'string' || !name.trim()) throw new PropertyError('Property name is required', 400);
  if (name.trim().length > 120) throw new PropertyError('Property name must be 120 characters or fewer', 400);
  if (typeof address !== 'string' || !address.trim()) throw new PropertyError('Address is required', 400);
  if (address.trim().length > 240) throw new PropertyError('Address must be 240 characters or fewer', 400);
  if (city !== undefined && (typeof city !== 'string' || city.trim().length > 120)) throw new PropertyError('City must be 120 characters or fewer', 400);
  if (category && !['Luxury', 'Studio', 'Penthouse', 'Residential', 'Commercial'].includes(category)) throw new PropertyError('Choose a valid property category', 400);
  if (!isValidTimezone(timezone)) throw new PropertyError('Choose a valid property timezone', 400);
  if (!Number.isInteger(renewalWindowDays) || renewalWindowDays < 0 || renewalWindowDays > 365) throw new PropertyError('Renewal window must be between 0 and 365 days', 400);
  validatePropertyDetails(payload);
  await assertCanAddToLandlordPlan(landlordId, { properties: 1 });

  const property = await Property.create({
    landlord: landlordId,
    name: name.trim(),
    address: address.trim(),
    city: city?.trim() || 'Metro Area',
    timezone: timezone.trim(),
    renewalWindowDays,
    category: category || 'Residential',
    image: image || '/images/default-property.jpg',
    petsAllowed: Boolean(payload.petsAllowed),
    parkingAvailable: Boolean(payload.parkingAvailable),
    accessCodes: payload.accessCodes || {},
    buildingRules: Array.isArray(payload.buildingRules) ? payload.buildingRules.map((rule) => String(rule).trim()).filter(Boolean) : [],
    unitsCount: 0,
    occupancyRate: 0,
  });

  await logAction({
    actorId: landlordId,
    action: 'PROPERTY_CREATED',
    entityKind: 'Property',
    entityId: property._id,
    afterState: property.toObject(),
    ipAddress,
  });

  return {
    ...property.toObject(),
    id: property._id,
  };
}

/**
 * UPDATE a property
 */
export async function updateProperty(landlordId, propertyId, payload, ipAddress = '') {
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId });
  if (!property) {
    throw new PropertyError('Property not found or access denied', 404);
  }

  const beforeState = property.toObject();

  validatePropertyDetails(payload);

  if (payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 120) throw new PropertyError('Property name must be 1–120 characters', 400);
    property.name = payload.name.trim();
  }
  if (payload.address !== undefined) {
    if (typeof payload.address !== 'string' || !payload.address.trim() || payload.address.trim().length > 240) throw new PropertyError('Address must be 1–240 characters', 400);
    property.address = payload.address.trim();
  }
  if (payload.city !== undefined) {
    if (typeof payload.city !== 'string' || payload.city.trim().length > 120) throw new PropertyError('City must be 120 characters or fewer', 400);
    property.city = payload.city.trim();
  }
  if (payload.timezone !== undefined) {
    if (!isValidTimezone(payload.timezone)) throw new PropertyError('Choose a valid property timezone', 400);
    property.timezone = payload.timezone.trim();
  }
  if (payload.renewalWindowDays !== undefined) {
    const days = Number(payload.renewalWindowDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) throw new PropertyError('Renewal window must be between 0 and 365 days', 400);
    property.renewalWindowDays = days;
  }
  if (payload.petsAllowed !== undefined) property.petsAllowed = Boolean(payload.petsAllowed);
  if (payload.parkingAvailable !== undefined) property.parkingAvailable = Boolean(payload.parkingAvailable);
  if (payload.category !== undefined) {
    if (!['Luxury', 'Studio', 'Penthouse', 'Residential', 'Commercial'].includes(payload.category)) throw new PropertyError('Choose a valid property category', 400);
    property.category = payload.category;
  }
  if (payload.image) property.image = payload.image;
  if (payload.featured !== undefined) property.featured = Boolean(payload.featured);

  // Access codes (gate, wifi) — any provided key is updated individually
  if (payload.accessCodes && typeof payload.accessCodes === 'object') {
    property.accessCodes = {
      gateCode:     payload.accessCodes.gateCode     ?? property.accessCodes?.gateCode     ?? '',
      wifiSsid:     payload.accessCodes.wifiSsid     ?? property.accessCodes?.wifiSsid     ?? '',
      wifiPassword: payload.accessCodes.wifiPassword ?? property.accessCodes?.wifiPassword ?? '',
    };
  }

  // Building rules — replace the full array when provided
  if (Array.isArray(payload.buildingRules)) {
    property.buildingRules = payload.buildingRules.map((r) => String(r).trim()).filter(Boolean);
  }

  await property.save();

  await logAction({
    actorId: landlordId,
    action: 'PROPERTY_UPDATED',
    entityKind: 'Property',
    entityId: property._id,
    beforeState,
    afterState: property.toObject(),
    ipAddress,
  });

  return {
    ...property.toObject(),
    id: property._id,
  };
}

function validatePropertyDetails(payload) {
  const accessCodes = payload.accessCodes;
  if (accessCodes && typeof accessCodes === 'object') {
    for (const key of ['gateCode', 'wifiSsid', 'wifiPassword']) {
      if (accessCodes[key] !== undefined && String(accessCodes[key]).length > 120) {
        throw new PropertyError(`${key} must be 120 characters or fewer`, 400);
      }
    }
  }
  if (payload.accessCodes !== undefined && (!payload.accessCodes || typeof payload.accessCodes !== 'object' || Array.isArray(payload.accessCodes))) throw new PropertyError('Access details must be an object', 400);
  for (const key of ['petsAllowed', 'parkingAvailable']) {
    if (payload[key] !== undefined && typeof payload[key] !== 'boolean') throw new PropertyError(`${key} must be true or false`, 400);
  }
  if (Array.isArray(payload.buildingRules)) {
    if (payload.buildingRules.length > 30 || payload.buildingRules.some((rule) => typeof rule !== 'string' || rule.trim().length > 500)) {
      throw new PropertyError('Add up to 30 rules, each 500 characters or fewer', 400);
    }
  } else if (payload.buildingRules !== undefined) {
    throw new PropertyError('Rules and policies must be a list', 400);
  }
}

/**
 * DELETE a property (+ cascade vacant units or enforce safety check)
 */
export async function deleteProperty(landlordId, propertyId, { force = false, ipAddress = '' } = {}) {
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId });
  if (!property) {
    throw new PropertyError('Property not found or access denied', 404);
  }

  const units = await Unit.find({ property: propertyId });
  const occupiedUnits = units.filter((u) => u.status === 'occupied' || u.tenant);

  if (occupiedUnits.length > 0 && !force) {
    throw new PropertyError(
      `Cannot delete property "${property.name}" because it has ${occupiedUnits.length} occupied unit(s). Please vacate or reassign tenants before deleting.`,
      400
    );
  }

  const beforeState = {
    property: property.toObject(),
    unitsCount: units.length,
    occupiedUnitsCount: occupiedUnits.length,
  };

  // Delete all units under this property
  const deleteUnitsResult = await Unit.deleteMany({ property: propertyId });

  // Delete property
  await Property.findByIdAndDelete(propertyId);

  // Write audit log
  await logAction({
    actorId: landlordId,
    action: 'PROPERTY_DELETED',
    entityKind: 'Property',
    entityId: propertyId,
    beforeState,
    afterState: null,
    ipAddress,
  });

  return {
    success: true,
    message: `Property "${property.name}" and ${deleteUnitsResult.deletedCount} associated unit(s) were successfully deleted.`,
    deletedPropertyId: propertyId,
    deletedUnitsCount: deleteUnitsResult.deletedCount,
  };
}

/**
 * ADD a Unit to a property
 */
export async function addUnitToProperty(landlordId, propertyId, payload, ipAddress = '') {
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId });
  if (!property || property.status === 'inactive') {
    throw new PropertyError('Property not found or access denied', 404);
  }

  const { label, monthlyRent, bedrooms = 1, bathrooms = 1, sqft = 800, hasParking = false, parkingSpot = '', parkingFee = 0, petsAllowed } = payload;
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 80) throw new PropertyError('Unit label must be 1–80 characters', 400);
  if (!Number.isFinite(Number(monthlyRent)) || Number(monthlyRent) <= 0) throw new PropertyError('Valid monthly rent is required', 400);
  if (![bedrooms, bathrooms, sqft, parkingFee].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) throw new PropertyError('Unit measurements and fees must be valid non-negative numbers', 400);
  if (typeof hasParking !== 'boolean') throw new PropertyError('Parking selection must be true or false', 400);
  if (parkingSpot && (typeof parkingSpot !== 'string' || parkingSpot.length > 80)) throw new PropertyError('Parking space must be 80 characters or fewer', 400);
  if (petsAllowed !== undefined && petsAllowed !== null && typeof petsAllowed !== 'boolean') throw new PropertyError('Pet policy must be true or false', 400);
  const utilityBilling = payload.utilityBilling || [];
  if (!Array.isArray(utilityBilling) || utilityBilling.length > 5 || utilityBilling.some((item) => !['electricity', 'water', 'gas', 'internet', 'other'].includes(item.utilityType) || !['separate_meter', 'shared_meter'].includes(item.billingMode) || (item.chargeMode !== undefined && !['fixed_in_rent', 'actual_bill'].includes(item.chargeMode)) || !Number.isFinite(Number(item.monthlyShare)) || Number(item.monthlyShare) < 0 || String(item.notes || '').length > 300)) throw new PropertyError('Utility bills must have a valid type, billing mode, non-negative monthly share, and short note', 400);
  await assertCanAddToLandlordPlan(landlordId, { units: 1 });

  const unit = await Unit.create({
    property: propertyId,
    label: label.trim(),
    monthlyRent: Number(monthlyRent),
    bedrooms: Number(bedrooms) || 0,
    bathrooms: Number(bathrooms) || 1,
    sqft: Number(sqft) || 500,
    hasParking: Boolean(hasParking),
    parkingSpot: hasParking ? String(parkingSpot).trim() : null,
    parkingFee: hasParking ? Number(parkingFee) || 0 : 0,
    ...(petsAllowed !== undefined ? { petsAllowed } : {}),
    utilityBilling: (payload.utilityBilling || []).map((item) => ({ ...item, monthlyShare: Number(item.monthlyShare || 0), notes: String(item.notes || '').trim() })),
    status: 'vacant',
  });

  await updatePropertyMetrics(propertyId);

  await logAction({
    actorId: landlordId,
    action: 'UNIT_CREATED',
    entityKind: 'Unit',
    entityId: unit._id,
    afterState: unit.toObject(),
    ipAddress,
  });

  return {
    ...unit.toObject(),
    id: unit._id,
  };
}

/**
 * DELETE a Unit
 */
export async function deleteUnit(landlordId, propertyId, unitId, ipAddress = '') {
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId });
  if (!property) {
    throw new PropertyError('Property not found or access denied', 404);
  }

  const unit = await Unit.findOne({ _id: unitId, property: propertyId });
  if (!unit) {
    throw new PropertyError('Unit not found', 404);
  }

  if (unit.status === 'occupied' || unit.tenant) {
    throw new PropertyError('Cannot delete unit with an active tenant. Reassign tenant first.', 400);
  }

  const beforeState = unit.toObject();
  await Unit.findByIdAndDelete(unitId);
  await updatePropertyMetrics(propertyId);

  await logAction({
    actorId: landlordId,
    action: 'UNIT_DELETED',
    entityKind: 'Unit',
    entityId: unitId,
    beforeState,
    afterState: null,
    ipAddress,
  });

  return {
    success: true,
    message: `Unit "${unit.label}" deleted successfully.`,
    deletedUnitId: unitId,
  };
}

const IMAGE_SIGNATURES = [
  (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, // JPEG
  (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), // PNG
  (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP', // WebP
];

/** Replace a property's cover photo (JPG, PNG or WebP, max 5 MB). */
export async function updatePropertyImage(landlordId, propertyId, file, ipAddress = '') {
  const property = await Property.findOne({ _id: propertyId, landlord: landlordId });
  if (!property) throw new PropertyError('Property not found', 404);
  if (!file?.buffer || !IMAGE_SIGNATURES.some((check) => check(file.buffer))) throw new PropertyError('Choose a JPG, PNG, or WebP image.', 400);
  if (file.size > 5 * 1024 * 1024) throw new PropertyError('Images must be 5 MB or smaller.', 400);
  const client = getCloudinaryClient();
  if (!client) throw new PropertyError('Image storage is not configured on this server.', 503);
  const uploaded = await new Promise((resolve, reject) => {
    client.uploader.upload_stream({
      folder: 'jptl_property_images',
      resource_type: 'image',
      public_id: `${property._id}_${Date.now()}`,
      transformation: [{ width: 1600, height: 1000, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    }, (error, result) => (error ? reject(error) : resolve(result))).end(file.buffer);
  });
  const before = property.image;
  property.image = uploaded.secure_url;
  await property.save();
  await logAction({ actorId: landlordId, action: 'PROPERTY_IMAGE_UPDATED', entityKind: 'Property', entityId: property._id, beforeState: { image: before }, afterState: { image: property.image }, ipAddress });
  return { id: property._id, image: property.image };
}
