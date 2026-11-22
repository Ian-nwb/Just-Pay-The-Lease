import PropertyPolicy from '../models/propertyPolicy.model.js';
import Property from '../models/property.model.js';
import TenantProfile from '../models/tenantProfile.model.js';
import AuditLog from '../models/auditLog.model.js';
import { uploadPaymentAssetToCloudinary, getPrivatePaymentAssetUrl } from '../config/cloudinary.js';
import { createNotificationForMany } from './notification.service.js';
import { sendPushToUsers } from './pushNotification.service.js';

export const POLICY_TYPES = ['House Rules', 'Lease Addendum', 'Move-Out Guide', 'Parking Policy', 'General Policy'];
const MAX_BYTES = 15 * 1024 * 1024;

export class PolicyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function formatPolicy(policy, propertyNames = new Map()) {
  return {
    id: policy._id,
    title: policy.title,
    type: policy.type,
    notes: policy.notes,
    fileName: policy.fileName,
    size: `${(Number(policy.fileBytes || 0) / (1024 * 1024)).toFixed(2)} MB`,
    status: policy.status,
    properties: (policy.properties || []).map((id) => ({ id, name: propertyNames.get(String(id)) || 'Property' })),
    publishedAt: policy.createdAt,
    archivedAt: policy.archivedAt,
  };
}

/** Landlord publishes a PDF to one property or to all of their active properties. */
export async function publishPolicy(landlordId, payload = {}, file, ipAddress = '') {
  const title = String(payload.title || '').trim();
  const notes = String(payload.notes || '').trim();
  if (!title || title.length > 140) throw new PolicyError('Title must be 1–140 characters.');
  if (!POLICY_TYPES.includes(payload.type)) throw new PolicyError('Choose a valid policy type.');
  if (notes.length > 1000) throw new PolicyError('Notes must be 1000 characters or fewer.');
  if (!file?.buffer || file.buffer.length < 5 || file.buffer.toString('ascii', 0, 5) !== '%PDF-') throw new PolicyError('Choose a valid PDF file.');
  if (file.size > MAX_BYTES) throw new PolicyError('Policy PDF must be 15 MB or smaller.');

  const scope = String(payload.propertyId || 'all');
  const filter = { landlord: landlordId, status: { $ne: 'inactive' } };
  if (scope !== 'all') filter._id = scope;
  const properties = await Property.find(filter).select('_id name').lean();
  if (!properties.length) throw new PolicyError(scope === 'all' ? 'Add an active property before publishing a policy.' : 'Choose one of your active properties.', 404);

  const upload = await uploadPaymentAssetToCloudinary(file.buffer, file.originalname || `${title}.pdf`, { privateAsset: true, folder: 'jptl_property_policies' });
  const fileName = (file.originalname || `${title}.pdf`).replace(/[^\w.\- ]+/g, '_').slice(0, 180);
  const policy = await PropertyPolicy.create({
    landlord: landlordId,
    properties: properties.map((p) => p._id),
    title, type: payload.type, notes,
    fileName: /\.pdf$/i.test(fileName) ? fileName : `${fileName}.pdf`,
    fileBytes: Number(upload.bytes || file.size),
    filePublicId: upload.public_id,
    fileFormat: upload.format || 'pdf',
    fileResourceType: upload.resource_type === 'raw' ? 'raw' : 'image',
    publishedBy: landlordId,
  });

  await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'POLICY_PUBLISHED', entityKind: 'PropertyPolicy', entityId: policy._id, afterState: { title, type: policy.type, properties: policy.properties }, ipAddress })
    .catch((error) => console.error('Policy audit log failed:', error.message));

  const residents = await TenantProfile.find({ property: { $in: policy.properties }, status: 'active' }).select('user').lean();
  const residentIds = residents.map((r) => r.user);
  if (residentIds.length) {
    const message = { title: `New ${policy.type.toLowerCase()} posted`, body: `${title} is available in your Documents.` };
    await createNotificationForMany(residentIds, { ...message, type: 'announcement' });
    await sendPushToUsers(residentIds, { ...message, url: '/tenant/documents', category: 'announcements' });
  }

  return formatPolicy(policy.toObject(), new Map(properties.map((p) => [String(p._id), p.name])));
}

export async function listLandlordPolicies(landlordId) {
  const [policies, properties] = await Promise.all([
    PropertyPolicy.find({ landlord: landlordId }).sort({ createdAt: -1 }).lean(),
    Property.find({ landlord: landlordId }).select('_id name').lean(),
  ]);
  const names = new Map(properties.map((p) => [String(p._id), p.name]));
  return policies.map((policy) => formatPolicy(policy, names));
}

export async function archivePolicy(landlordId, policyId, ipAddress = '') {
  const policy = await PropertyPolicy.findOne({ _id: policyId, landlord: landlordId });
  if (!policy) throw new PolicyError('Policy not found.', 404);
  if (policy.status !== 'archived') {
    policy.status = 'archived';
    policy.archivedAt = new Date();
    await policy.save();
    await AuditLog.create({ actor: landlordId, actorRole: 'landlord', action: 'POLICY_ARCHIVED', entityKind: 'PropertyPolicy', entityId: policy._id, ipAddress })
      .catch((error) => console.error('Policy audit log failed:', error.message));
  }
  return formatPolicy(policy.toObject());
}

/** Active policies for the tenant's current property only. */
export async function listTenantPolicies(tenantId) {
  const profile = await TenantProfile.findOne({ user: tenantId }).select('property').lean();
  if (!profile?.property) return [];
  const property = await Property.findById(profile.property).select('_id name').lean();
  const policies = await PropertyPolicy.find({ properties: profile.property, status: 'active' }).sort({ createdAt: -1 }).lean();
  const names = new Map(property ? [[String(property._id), property.name]] : []);
  return policies.map((policy) => ({ ...formatPolicy(policy, names), properties: undefined, propertyName: property?.name || '' }));
}

async function streamPolicy(policy) {
  const url = await getPrivatePaymentAssetUrl(policy.filePublicId, policy.fileFormat || 'pdf', policy.fileResourceType || 'image');
  if (!url) throw new PolicyError('Policy file is unavailable.', 404);
  const response = await fetch(url);
  if (!response.ok) throw new PolicyError('Policy file is unavailable.', 404);
  return { stream: response.body, name: policy.fileName, mimeType: 'application/pdf' };
}

export async function getLandlordPolicyFile(landlordId, policyId) {
  const policy = await PropertyPolicy.findOne({ _id: policyId, landlord: landlordId }).lean();
  if (!policy) throw new PolicyError('Policy not found.', 404);
  return streamPolicy(policy);
}

export async function getTenantPolicyFile(tenantId, policyId) {
  const profile = await TenantProfile.findOne({ user: tenantId }).select('property').lean();
  const policy = profile?.property
    ? await PropertyPolicy.findOne({ _id: policyId, properties: profile.property, status: 'active' }).lean()
    : null;
  if (!policy) throw new PolicyError('Policy not found.', 404);
  return streamPolicy(policy);
}
