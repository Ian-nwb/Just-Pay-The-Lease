import mongoose from 'mongoose';
import InventoryItem from '../models/inventoryItem.model.js';
import Property from '../models/property.model.js';
import Unit from '../models/unit.model.js';
import Lease from '../models/lease.model.js';
import AuditLog from '../models/auditLog.model.js';
import { uploadTicketPhotoToCloudinary } from '../config/cloudinary.js';
import { createNotification } from './notification.service.js';
import { assertTenantHasActiveLease } from './tenantLeaseAccess.service.js';

export class InventoryError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const allowedConditions = ['new', 'good', 'fair', 'damaged', 'not_working'];

export async function listLandlordInventory(landlordId, context = {}) {
  const properties = await Property.find({ landlord: landlordId, ...(context.propertyIds ? { _id: { $in: context.propertyIds } } : {}) }).select('_id').lean();
  return InventoryItem.find({ property: { $in: properties.map((p) => p._id) } }).populate('unit', 'label').populate('lease', 'tenant').sort({ createdAt: -1 }).lean();
}

function validImage(file) {
  const b = file?.buffer;
  return Boolean(b && ((b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) || (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')));
}

export async function createInventoryItem(landlordId, body = {}, files = [], context = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(body.unitId)) throw new InventoryError('Choose a valid unit', 400);
  const unit = await Unit.findById(body.unitId).populate('property', 'landlord status').lean();
  if (!unit || String(unit.property?.landlord) !== String(landlordId) || unit.property?.status === 'inactive') throw new InventoryError('Unit not found or access denied', 404);
  if (context.propertyIds && !context.propertyIds.some((id) => String(id) === String(unit.property._id))) throw new InventoryError('Unit not found or access denied', 404);
  const label = String(body.label || '').trim();
  if (!label || label.length > 120) throw new InventoryError('Item label is required and must be 120 characters or fewer', 400);
  if (!allowedConditions.includes(body.condition)) throw new InventoryError('Choose a valid item condition', 400);
  if (files.length > 8 || files.some((file) => file.size > 8 * 1024 * 1024 || !validImage(file))) throw new InventoryError('Upload up to 8 valid PNG, JPG, or WebP photos (8 MB maximum each)', 400);
  const lease = await Lease.findOne({ unit: unit._id, status: { $ne: 'ended' } }).sort({ createdAt: -1 }).select('_id tenant').lean();
  const photos = [];
  for (const file of files) {
    const result = await uploadTicketPhotoToCloudinary(file.buffer, file.originalname);
    photos.push({ url: result.secure_url, publicId: result.public_id, name: file.originalname });
  }
  const item = await InventoryItem.create({ property: unit.property._id, unit: unit._id, lease: lease?._id || null, label, condition: body.condition, notes: String(body.notes || '').trim().slice(0, 2000), photos, createdBy: landlordId });
  await AuditLog.create({ actor: landlordId, actorRole: context.propertyIds ? 'staff' : 'landlord', action: 'INVENTORY_ITEM_CREATED', entityKind: 'InventoryItem', entityId: item._id, ipAddress });
  if (lease?.tenant) await createNotification({ userId: lease.tenant, title: 'Move-in inventory updated', body: `${label} was added to the unit condition record.`, type: 'system', refModel: null });
  return item.toObject();
}

export async function getTenantInventory(tenantId) {
  const leases = await Lease.find({ tenant: tenantId, status: { $ne: 'ended' } }).select('_id unit').lean();
  if (!leases.length) return [];
  return InventoryItem.find({ lease: { $in: leases.map((l) => l._id) }, unit: { $in: leases.map((l) => l.unit) } }).populate('unit', 'label').sort({ createdAt: -1 }).lean();
}

export async function respondToInventory(tenantId, itemId, body = {}, ipAddress = '') {
  if (!mongoose.Types.ObjectId.isValid(itemId)) throw new InventoryError('Invalid inventory item ID', 400);
  if (!['confirmed', 'disputed'].includes(body.response)) throw new InventoryError('Choose confirm or dispute', 400);
  await assertTenantHasActiveLease(tenantId); // condition responses only during the active tenancy
  const item = await InventoryItem.findOne({ _id: itemId, tenantResponse: 'pending' });
  if (!item) throw new InventoryError('Inventory item is unavailable or already answered', 404);
  const activeLease = await Lease.exists({ _id: item.lease, tenant: tenantId, unit: item.unit, status: { $ne: 'ended' } });
  if (!activeLease) throw new InventoryError('Only the current tenant on this lease can respond', 403);
  const note = String(body.note || '').trim();
  if (body.response === 'disputed' && (note.length < 3 || note.length > 2000)) throw new InventoryError('Add a dispute note between 3 and 2000 characters', 400);
  if (note.length > 2000) throw new InventoryError('Note must be 2000 characters or fewer', 400);
  item.tenantResponse = body.response;
  item.tenantNote = note;
  item.respondedAt = new Date();
  await item.save();
  await AuditLog.create({ actor: tenantId, actorRole: 'tenant', action: body.response === 'confirmed' ? 'INVENTORY_CONFIRMED' : 'INVENTORY_DISPUTED', entityKind: 'InventoryItem', entityId: item._id, afterState: { note }, ipAddress });
  const property = await Property.findById(item.property).select('landlord').lean();
  if (property?.landlord) await createNotification({ userId: property.landlord, title: body.response === 'disputed' ? 'Inventory item disputed' : 'Inventory confirmed', body: `${item.label}${note ? `: ${note}` : ''}`, type: 'system', refModel: null });
  return item.toObject();
}
