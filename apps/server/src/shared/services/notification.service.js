import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';

/**
 * Create an in-app notification for a user.
 * This is a fire-and-forget helper — errors are logged but never thrown.
 */
export async function createNotification({ userId, title, body, type = 'system', refModel = null, refId = null, alertCategory = null }) {
  try {
    if (alertCategory === 'newTicket') {
      const recipient = await User.findById(userId).select('role preferences').lean();
      if (!recipient) return;
      if (recipient.role === 'landlord' && recipient.preferences?.alerts?.newTicket === false) return;
    }
    await Notification.create({
      user: userId,
      title,
      body,
      type,
      refModel,
      refId,
    });
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
}

/**
 * Create notifications for multiple users at once.
 */
export async function createNotificationForMany(userIds, { title, body, type = 'system', refModel = null, refId = null }) {
  try {
    const docs = userIds.map((uid) => ({
      user: uid,
      title,
      body,
      type,
      refModel,
      refId,
    }));
    if (docs.length > 0) {
      await Notification.insertMany(docs);
    }
  } catch (err) {
    console.error('createNotificationForMany error:', err.message);
  }
}
