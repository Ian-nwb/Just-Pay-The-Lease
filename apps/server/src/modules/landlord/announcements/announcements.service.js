import Announcement from '../../../shared/models/announcements.model.js';
import User from '../../../shared/models/user.model.js';
import { sendPushToUsers } from '../../../shared/services/pushNotification.service.js';
import { createNotificationForMany } from '../../../shared/services/notification.service.js';
import TenantProfile from '../../../shared/models/tenantProfile.model.js';
import Property from '../../../shared/models/property.model.js';

/**
 * Create a new announcement for the logged-in landlord
 */
export async function createAnnouncement(authorId, data, options = {}) {
  const { title, content, category, isPinned } = data;

  if (!title?.trim() || !content?.trim()) {
    throw new Error('Title and content are required');
  }

  const propertyId = options.propertyId || data.propertyId || null;
  if (propertyId) {
    const property = await Property.findOne({ _id: propertyId, landlord: authorId });
    if (!property) throw new Error('Selected property is not available to this workspace.');
  }

  const announcement = await Announcement.create({
    title: title.trim(),
    content: content.trim(),
    category: category || 'General',
    isPinned: Boolean(isPinned),
    author: authorId,
    property: propertyId,
  });

  // Dispatch in-app notifications and push notifications to all tenants under this landlord
  try {
    const tenantQuery = { landlord: authorId, role: 'tenant' };
    if (propertyId) {
      const profiles = await TenantProfile.find({ property: propertyId }).select('user').lean();
      tenantQuery._id = { $in: profiles.map((profile) => profile.user) };
    }
    const tenants = await User.find(tenantQuery).select('_id').lean();
    const tenantIds = tenants.map((t) => t._id);
    if (tenantIds.length > 0) {
      // Create in-app notifications
      await createNotificationForMany(tenantIds, {
        title: `📢 ${title.trim().slice(0, 50)}`,
        body: content.trim().slice(0, 120),
        type: 'announcement',
        refModel: 'Announcement',
        refId: announcement._id,
      });

      // Send Web Push notifications
      sendPushToUsers(tenantIds, {
        title: `📢 New Announcement: ${title.trim().slice(0, 50)}`,
        body: content.trim().slice(0, 120),
        category: 'announcements',
        url: '/tenant',
      }).catch((err) => console.error('Push notification error:', err.message));
    }
  } catch (err) {
    console.error('Failed to dispatch notifications for announcement:', err.message);
  }

  return announcement.populate('author', 'firstName lastName role');
}

/**
 * Retrieve only the announcements created by the logged-in landlord
 */
export async function getLandlordAnnouncements(landlordId, { category, search } = {}, context = {}) {
  // Filter exclusively by the logged-in landlord's user ID
  const query = { author: landlordId };
  const scopedFilters = [];
  if (context.propertyIds) scopedFilters.push({ $or: [{ property: null }, { property: { $in: context.propertyIds } }] });

  if (category && category !== 'All') {
    query.category = category;
  }

  if (search) {
    scopedFilters.push({ $or: [
      { title: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
    ] });
  }
  if (scopedFilters.length) query.$and = scopedFilters;

  return await Announcement.find(query)
    .populate('author', 'firstName lastName role')
    .sort({ isPinned: -1, createdAt: -1 });
}

/**
 * Delete an announcement created by the landlord
 */
export async function deleteLandlordAnnouncement(landlordId, announcementId) {
  const announcement = await Announcement.findOne({ _id: announcementId, author: landlordId });
  if (!announcement) {
    throw new Error('Announcement not found or unauthorized');
  }

  await Announcement.findByIdAndDelete(announcementId);
  return { success: true, message: 'Announcement deleted successfully', announcementId };
}
