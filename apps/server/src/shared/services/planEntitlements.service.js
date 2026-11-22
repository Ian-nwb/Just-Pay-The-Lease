import Property from '../models/property.model.js';
import Unit from '../models/unit.model.js';
import User from '../models/user.model.js';

export const PLAN_ENTITLEMENTS = Object.freeze({
  starter: Object.freeze({ properties: 3, units: 10 }),
  pro: Object.freeze({ properties: 10, units: 20 }),
  enterprise: Object.freeze({ properties: 10, units: 20, comingSoon: true }),
});

export class PlanEntitlementError extends Error {
  constructor(message, statusCode = 409, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function getPlanEntitlements(plan = 'starter') {
  const normalized = String(plan || 'starter').toLowerCase();
  return PLAN_ENTITLEMENTS[normalized] || PLAN_ENTITLEMENTS.starter;
}

export function assertPlanCapacity({ plan = 'starter', properties = 0, units = 0, addProperties = 0, addUnits = 0 } = {}) {
  const limits = getPlanEntitlements(plan);
  if (limits.comingSoon) throw new PlanEntitlementError('Enterprise is not available yet. Choose Starter or Professional.', 409, { plan, comingSoon: true });
  const nextProperties = Number(properties) + Number(addProperties);
  const nextUnits = Number(units) + Number(addUnits);
  if (nextProperties > limits.properties) {
    throw new PlanEntitlementError(`Your ${plan} plan allows up to ${limits.properties} active properties. Deactivate a property or change plans to add another.`, 409, { plan, metric: 'properties', current: properties, requested: addProperties, limit: limits.properties });
  }
  if (nextUnits > limits.units) {
    throw new PlanEntitlementError(`Your ${plan} plan allows up to ${limits.units} active units across your active properties. Deactivate a unit or change plans to add another.`, 409, { plan, metric: 'units', current: units, requested: addUnits, limit: limits.units });
  }
  return { properties: nextProperties, units: nextUnits, limits };
}

export async function getLandlordPlanUsage(landlordId) {
  const landlord = await User.findById(landlordId).select('plan').lean();
  if (!landlord) throw new PlanEntitlementError('Landlord account not found', 404);
  const activeProperties = await Property.find({ landlord: landlordId, status: { $ne: 'inactive' } }).select('_id').lean();
  const activePropertyIds = activeProperties.map((property) => property._id);
  const activeUnits = await Unit.countDocuments({ property: { $in: activePropertyIds }, isActive: { $ne: false } });
  const entitlements = getPlanEntitlements(landlord.plan);
  return {
    plan: landlord.plan || 'starter',
    properties: activeProperties.length,
    units: activeUnits,
    limits: { properties: entitlements.properties, units: entitlements.units },
  };
}

export async function assertCanAddToLandlordPlan(landlordId, { properties = 0, units = 0 } = {}) {
  const usage = await getLandlordPlanUsage(landlordId);
  assertPlanCapacity({ plan: usage.plan, properties: usage.properties, units: usage.units, addProperties: properties, addUnits: units });
  return usage;
}
