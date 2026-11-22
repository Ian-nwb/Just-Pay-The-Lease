import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Property from '../models/property.model.js';
import Unit from '../models/unit.model.js';
import Lease from '../models/lease.model.js';
import Ticket from '../models/ticket.model.js';
import MessageThread from '../models/messageThread.model.js';
import WorkspaceMessage from '../models/workspaceMessage.model.js';
import AuditLog from '../models/auditLog.model.js';
import { createNotification } from './notification.service.js';
import { uploadPaymentAssetToCloudinary, getPrivatePaymentAssetUrl } from '../config/cloudinary.js';

export class MessagingError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const idOf = (user) => String(user?._id || user?.id || '');

async function permittedPropertyIds(user) {
  const id = idOf(user);
  if (user.role === 'landlord') return (await Property.find({ landlord: id, status: 'active' }).select('_id').lean()).map((p) => String(p._id));
  if (user.role === 'staff') {
    const ownerId = user.landlord;
    let propertyIds = (user.propertyAssignments || []).map(String);
    if (user.staffType === 'technician') {
      // Assigned properties (for direct landlord chat) plus properties of their tickets.
      const assigned = await Ticket.find({ assignedStaff: id }).select('unit').lean();
      const units = assigned.length ? await Unit.find({ _id: { $in: assigned.map((t) => t.unit) } }).select('property').lean() : [];
      propertyIds = [...new Set([...propertyIds, ...units.map((u) => String(u.property))])];
    }
    return (await Property.find({ _id: { $in: propertyIds }, landlord: ownerId, status: 'active' }).select('_id').lean()).map((p) => String(p._id));
  }
  if (user.role === 'tenant') {
    const leases = await Lease.find({ tenant: id, status: { $ne: 'ended' } }).select('property').lean();
    const units = await Unit.find({ tenant: id }).select('property').lean();
    return [...new Set([...leases.map((x) => String(x.property)), ...units.map((x) => String(x.property))])];
  }
  return [];
}

async function assertConversationAccess(user, otherId, propertyId, unitId = null) {
  if (!mongoose.Types.ObjectId.isValid(otherId) || !mongoose.Types.ObjectId.isValid(propertyId)) throw new MessagingError('A valid participant and property are required', 400);
  const [property, other] = await Promise.all([
    Property.findById(propertyId).select('landlord status').lean(),
    User.findById(otherId).select('role staffType landlord propertyAssignments status').lean(),
  ]);
  if (!property || property.status === 'inactive' || !other || other.status === 'suspended') throw new MessagingError('Participant or property is unavailable', 404);
  const allowed = new Set(await permittedPropertyIds(user));
  if (!allowed.has(String(property._id))) throw new MessagingError('You do not have access to this property conversation', 403);
  const otherAllowed = new Set(await permittedPropertyIds({ ...other, _id: other._id }));
  if (!otherAllowed.has(String(property._id))) throw new MessagingError('The selected person is not assigned to this property', 403);
  if (unitId) {
    if (!mongoose.Types.ObjectId.isValid(unitId)) throw new MessagingError('Invalid unit', 400);
    const unit = await Unit.findOne({ _id: unitId, property: property._id }).select('tenant').lean();
    if (!unit) throw new MessagingError('Unit not found in this property', 404);
    if (user.role === 'tenant' && String(unit.tenant || '') !== idOf(user)) throw new MessagingError('Unit does not belong to your tenancy', 403);
    if (other.role === 'tenant' && String(unit.tenant || '') !== String(other._id)) throw new MessagingError('Tenant does not belong to this unit', 403);
    if (user.role === 'staff' && user.staffType === 'technician' && !await Ticket.exists({ assignedStaff: idOf(user), unit: unit._id })) throw new MessagingError('Technicians can message people only about tickets assigned to them', 403);
    if (other.role === 'staff' && other.staffType === 'technician' && !await Ticket.exists({ assignedStaff: other._id, unit: unit._id })) throw new MessagingError('The technician is not assigned to this unit', 403);
  } else if ((user.role === 'staff' && user.staffType === 'technician') || (other.role === 'staff' && other.staffType === 'technician')) {
    // Direct landlord <-> technician chat is allowed per property; any other technician
    // conversation (e.g. with a tenant) must be about a unit with an assigned ticket.
    const pair = [user, other].map((u) => (u.role === 'landlord' ? 'landlord' : u.role === 'staff' && u.staffType === 'technician' ? 'technician' : 'other')).sort().join(':');
    const landlordId = user.role === 'landlord' ? idOf(user) : String(other._id || other.id);
    if (pair !== 'landlord:technician' || String(property.landlord) !== landlordId) {
      throw new MessagingError('Technician conversations must be linked to an assigned unit', 403);
    }
  }
  return property;
}

export async function listThreads(user) {
  const id = idOf(user);
  const filter = user.role === 'landlord'
    ? { $or: [{ participants: id }, { property: { $in: await Property.find({ landlord: id }).distinct('_id') } }] }
    // Non-landlords see only threads for properties they can still access. Removed
    // staff and former tenants lose access; the history stays for the landlord.
    : { participants: id, property: { $in: await permittedPropertyIds(user) } };
  return MessageThread.find(filter)
    .populate('property', 'name')
    .populate('unit', 'label')
    .populate('participants', 'firstName lastName role staffType')
    .sort({ lastMessageAt: -1 }).lean();
}

export async function listContacts(user) {
  const propertyIds = await permittedPropertyIds(user);
  if (!propertyIds.length) return [];
  const properties = await Property.find({ _id: { $in: propertyIds }, status: 'active' }).select('name landlord').lean();
  const propertyById = new Map(properties.map((p) => [String(p._id), p]));
  const units = await Unit.find({ property: { $in: propertyIds } }).select('label property tenant').populate('tenant', 'firstName lastName email role status').lean();
  const accounts = await User.find({ status: 'active', $or: [
    { _id: { $in: properties.map((p) => p.landlord) } },
    { role: 'staff', landlord: { $in: properties.map((p) => p.landlord) } },
  ] }).select('firstName lastName email role staffType landlord propertyAssignments').lean();
  const assignedTickets = user.role === 'staff' && user.staffType === 'technician' ? await Ticket.find({ assignedStaff: idOf(user) }).select('unit').lean() : [];
  const assignedUnitIds = new Set(assignedTickets.map((ticket) => String(ticket.unit)));
  const contacts = [];
  for (const unit of units) {
    const propertyId = String(unit.property);
    if (user.role === 'staff' && user.staffType === 'technician' && !assignedUnitIds.has(String(unit._id))) continue;
    // Residents only get contacts for their own unit: their landlord, that building's
    // property managers, and technicians working on their unit's tickets.
    if (user.role === 'tenant' && String(unit.tenant?._id || unit.tenant || '') !== idOf(user)) continue;
    const property = propertyById.get(propertyId);
    if (unit.tenant && String(unit.tenant._id) !== idOf(user) && unit.tenant.status === 'active' && user.role !== 'tenant') {
      contacts.push({ id: unit.tenant._id, name: `${unit.tenant.firstName || ''} ${unit.tenant.lastName || ''}`.trim() || unit.tenant.email, role: 'tenant', propertyId, propertyName: property?.name, unitId: unit._id, unitLabel: unit.label });
    }
    for (const account of accounts) {
      if (String(account._id) === idOf(user)) continue;
      if (account.role === 'staff' && !account.propertyAssignments?.some((id) => String(id) === propertyId)) continue;
      if (account.role === 'staff' && account.staffType === 'technician' && !await Ticket.exists({ assignedStaff: account._id, unit: unit._id })) continue;
      if (String(account._id) !== String(property?.landlord) && account.role !== 'staff') continue;
      const needsTicketUnit = user.role === 'tenant' || account.staffType === 'technician';
      contacts.push({ id: account._id, name: `${account.firstName || ''} ${account.lastName || ''}`.trim() || account.email, role: account.role === 'staff' ? account.staffType : account.role, propertyId, propertyName: property?.name, unitId: needsTicketUnit ? unit._id : null, unitLabel: needsTicketUnit ? unit.label : null });
    }
  }
  // Direct landlord <-> technician chat (property level, no unit).
  for (const property of properties) {
    const propertyId = String(property._id);
    if (user.role === 'staff' && user.staffType === 'technician') {
      const landlord = accounts.find((a) => String(a._id) === String(property.landlord));
      if (landlord) contacts.push({ id: landlord._id, name: `${landlord.firstName || ''} ${landlord.lastName || ''}`.trim() || landlord.email, role: 'landlord', propertyId, propertyName: property.name, unitId: null, unitLabel: null });
    }
    if (user.role === 'landlord') {
      for (const tech of accounts.filter((a) => a.role === 'staff' && a.staffType === 'technician' && a.propertyAssignments?.some((pid) => String(pid) === propertyId))) {
        contacts.push({ id: tech._id, name: `${tech.firstName || ''} ${tech.lastName || ''}`.trim() || tech.email, role: 'technician', propertyId, propertyName: property.name, unitId: null, unitLabel: null });
      }
    }
  }
  return [...new Map(contacts.map((contact) => [`${contact.id}:${contact.propertyId}:${contact.unitId || ''}`, contact])).values()];
}

export async function createThread(user, body = {}) {
  const senderId = idOf(user);
  const otherId = String(body.participantId || '');
  const propertyId = String(body.propertyId || '');
  const unitId = body.unitId ? String(body.unitId) : null;
  await assertConversationAccess(user, otherId, propertyId, unitId);
  const participants = [senderId, otherId].sort();
  const participantKey = `${propertyId}:${unitId || 'property'}:${participants.join(':')}`;
  const thread = await MessageThread.findOneAndUpdate(
    { participantKey },
    { $setOnInsert: { property: propertyId, unit: unitId, participants, participantKey, lastMessageAt: new Date() } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).populate('property', 'name').populate('unit', 'label').populate('participants', 'firstName lastName role staffType');
  await AuditLog.create({ actor: senderId, actorRole: user.role, action: 'MESSAGE_THREAD_OPENED', entityKind: 'MessageThread', entityId: thread._id });
  return thread.toObject();
}

export async function getThread(user, threadId) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) throw new MessagingError('Invalid conversation ID', 400);
  const thread = await MessageThread.findById(threadId).populate('property', 'name landlord').populate('unit', 'label').populate('participants', 'firstName lastName role staffType').lean();
  if (!thread) throw new MessagingError('Conversation not found or access denied', 404);
  const isParticipant = thread.participants.some((participant) => String(participant._id || participant) === idOf(user));
  const isOwningLandlord = user.role === 'landlord' && String(thread.property?.landlord || '') === idOf(user);
  if (!isParticipant && !isOwningLandlord) throw new MessagingError('Conversation not found or access denied', 404);
  if (!isOwningLandlord && !(await permittedPropertyIds(user)).includes(String(thread.property?._id || thread.property))) {
    throw new MessagingError('Conversation not found or access denied', 404);
  }
  const messages = await WorkspaceMessage.find({ thread: thread._id }).populate('sender', 'firstName lastName role staffType').sort({ createdAt: 1 }).lean();
  for (const message of messages) for (const attachment of message.attachments || []) {
    attachment.url = await getPrivatePaymentAssetUrl(attachment.publicId, attachment.format, attachment.format === 'pdf' ? 'raw' : 'image');
  }
  return { ...thread, messages };
}

function validAttachment(file) {
  if (!file?.buffer) return false;
  const b = file.buffer;
  return (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') ||
    (b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-');
}

export async function sendMessage(user, threadId, body = {}, file = null) {
  if (!mongoose.Types.ObjectId.isValid(threadId)) throw new MessagingError('Invalid conversation ID', 400);
  const thread = await MessageThread.findOne({ _id: threadId, participants: idOf(user) });
  if (!thread) throw new MessagingError('Conversation not found or access denied', 404);
  if (thread.closedAt) throw new MessagingError('This conversation is closed', 409);
  // Re-check current access for both sides: assignments, tickets and accounts can change after a thread starts.
  const recipientId = thread.participants.find((participant) => String(participant) !== idOf(user));
  if (recipientId) await assertConversationAccess(user, String(recipientId), String(thread.property), thread.unit ? String(thread.unit) : null);
  const messageText = String(body.body || '').trim();
  if ((!messageText && !file) || messageText.length > 5000) throw new MessagingError('Add a message or attachment. Messages can be up to 5000 characters.', 400);
  let attachments = [];
  if (file) {
    if (file.size > 8 * 1024 * 1024 || !validAttachment(file)) throw new MessagingError('Attachment must be a PNG, JPG, WebP, or PDF no larger than 8 MB', 400);
    const uploaded = await uploadPaymentAssetToCloudinary(file.buffer, file.originalname, { privateAsset: true, folder: 'jptl_workspace_messages' });
    attachments = [{ publicId: uploaded.public_id, name: file.originalname, format: uploaded.format || file.originalname.split('.').pop()?.toLowerCase(), bytes: uploaded.bytes || file.size }];
  }
  const message = await WorkspaceMessage.create({ thread: thread._id, sender: idOf(user), body: messageText, attachments, readBy: [idOf(user)] });
  thread.lastMessageAt = message.createdAt;
  await thread.save();
  const recipient = thread.participants.find((participant) => String(participant) !== idOf(user));
  if (recipient) await createNotification({ userId: recipient, title: 'New workspace message', body: messageText.slice(0, 140), type: 'system', refModel: null });
  return message.toObject();
}
