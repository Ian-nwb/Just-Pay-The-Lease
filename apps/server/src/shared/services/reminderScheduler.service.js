// Background reminders and deliveries:
//   - quiet-hours push flush
//   - tenant rent due / overdue reminders and landlord overdue summary
//   - lease-expiration reminders (tenant + landlord)
//   - opt-in daily email digests
//   - compliance document expiry reminders
// Every send is keyed (Notification.dedupeKey / ScheduledDelivery.key), so a
// repeated tick or several cluster workers cannot send the same thing twice.
import Notification from '../models/notification.model.js';
import Payment from '../models/payment.model.js';
import Lease from '../models/lease.model.js';
import User from '../models/user.model.js';
import ScheduledDelivery from '../models/scheduledDelivery.model.js';
import { deliverPush, sendPushToUsers } from './pushNotification.service.js';
import { sendEmail } from './email.service.js';
import { runComplianceExpirationReminders } from './complianceReminder.service.js';
import { runSubscriptionLifecycle } from './paymongo/subscription.service.js';
import { calendarDaysBetween, parseCalendarDate, propertyToday } from '../utils/propertyDatePolicy.js';
import { localParts } from '../utils/quietHours.js';

const TICK_MS = 15 * 60 * 1000;
const LEASE_NOTICE_DAYS = [60, 30, 7];
const RENT_DUE_SOON_DAYS = 3;
const DIGEST_LOCAL_MINUTES = 7 * 60; // send digests from 07:00 local time
const TYPE_TO_CATEGORY = { maintenance: 'maintenance', payment: 'payments', lease: 'lease', compliance: 'lease', announcement: 'announcements' };
let schedulerInterval = null;

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Create a notification once per dedupeKey; push it only when it is new. */
async function notifyOnce({ dedupeKey, userId, title, body, type, refModel = null, refId = null, pushCategory = null, url = '/' }) {
  try {
    const result = await Notification.updateOne(
      { dedupeKey },
      { $setOnInsert: { user: userId, title, body, type, refModel, refId, read: false, dedupeKey } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) {
      await sendPushToUsers([userId], { title, body, url, category: pushCategory });
      return true;
    }
  } catch (error) {
    if (error.code !== 11000) console.error('Reminder notification failed:', error.message);
  }
  return false;
}

/** Send pushes that were held back for quiet hours. */
export async function flushDeferredPushes(now = new Date()) {
  let sent = 0;
  for (;;) {
    const job = await ScheduledDelivery.findOneAndUpdate(
      { kind: 'push', status: 'queued', sendAfter: { $lte: now } },
      { $set: { status: 'sending' } },
      { sort: { sendAfter: 1 }, new: true }
    );
    if (!job) break;
    try {
      await deliverPush([job.user], job.payload || {});
      job.status = 'sent';
      job.sentAt = new Date();
      sent += 1;
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
    }
    await job.save();
  }
  return { sent };
}

/** Tenant rent reminders plus one daily overdue summary per landlord. */
export async function runRentReminders(now = new Date()) {
  const invoices = await Payment.find({
    status: { $in: ['pending', 'partially_paid', 'overdue'] },
    property: { $ne: null },
  }).populate('property', 'name timezone landlord status').populate('unit', 'label').lean();

  const overdueByLandlord = new Map();
  let created = 0;
  for (const invoice of invoices) {
    const property = invoice.property;
    if (!property || property.status === 'inactive') continue;
    const outstanding = Math.max(0, Number(invoice.amount || 0) - Number(invoice.paidAmount || 0));
    if (outstanding <= 0) continue;
    const timezone = property.timezone || 'Asia/Manila';
    const today = propertyToday(now, timezone);
    const due = parseCalendarDate(invoice.dueDate, timezone);
    const daysUntil = calendarDaysBetween(today, due);
    if (daysUntil == null) continue;
    const label = invoice.period || 'Rent';
    const awaitingReview = invoice.reviewStatus === 'pending_review';

    if (!awaitingReview && (daysUntil === RENT_DUE_SOON_DAYS || daysUntil === 0)) {
      const when = daysUntil === 0 ? 'today' : `in ${daysUntil} days`;
      if (await notifyOnce({
        dedupeKey: `rent-due:${invoice._id}:${due}:${daysUntil}`,
        userId: invoice.tenant,
        title: `${label} is due ${when}`,
        body: `${peso(outstanding)} is due on ${due} for ${invoice.unit?.label || 'your unit'}.`,
        type: 'payment', refModel: 'Payment', refId: invoice._id, pushCategory: 'payments', url: '/tenant/payments',
      })) created += 1;
    }

    if (daysUntil < 0) {
      const daysLate = -daysUntil;
      // Remind on the first day late, then weekly, so tenants aren't nagged daily.
      if (!awaitingReview && (daysLate - 1) % 7 === 0) {
        if (await notifyOnce({
          dedupeKey: `rent-overdue:${invoice._id}:${due}:${daysLate}`,
          userId: invoice.tenant,
          title: `${label} is overdue`,
          body: `${peso(outstanding)} was due on ${due} (${daysLate} ${daysLate === 1 ? 'day' : 'days'} ago).`,
          type: 'payment', refModel: 'Payment', refId: invoice._id, pushCategory: 'payments', url: '/tenant/payments',
        })) created += 1;
      }
      const key = String(property.landlord);
      const entry = overdueByLandlord.get(key) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += outstanding;
      overdueByLandlord.set(key, entry);
    }
  }

  if (overdueByLandlord.size) {
    const landlords = await User.find({ _id: { $in: [...overdueByLandlord.keys()] }, role: 'landlord' }).select('preferences timezone').lean();
    for (const landlord of landlords) {
      if (landlord.preferences?.alerts?.overduePayment === false) continue;
      const { count, total } = overdueByLandlord.get(String(landlord._id));
      const today = localParts(now, landlord.preferences?.timezone || landlord.timezone).date;
      if (await notifyOnce({
        dedupeKey: `overdue-summary:${landlord._id}:${today}`,
        userId: landlord._id,
        title: `${count} overdue ${count === 1 ? 'invoice' : 'invoices'}`,
        body: `${peso(total)} is outstanding past its due date. Review Rent Roll for details.`,
        type: 'payment', url: '/dashboard-payments',
      })) created += 1;
    }
  }
  return { created };
}

/** Notify tenant and landlord 60, 30 and 7 days before a fixed-term lease ends. */
export async function runLeaseExpiryReminders(now = new Date()) {
  const leases = await Lease.find({
    status: { $in: ['active', 'renewal_pending'] },
    leaseType: 'fixed_term',
    leaseEnd: { $ne: null },
  }).populate('property', 'name timezone status').populate('unit', 'label').lean();

  const landlordIds = [...new Set(leases.map((lease) => String(lease.landlord)))];
  const landlords = new Map((await User.find({ _id: { $in: landlordIds } }).select('preferences').lean()).map((u) => [String(u._id), u]));
  let created = 0;
  for (const lease of leases) {
    if (lease.property?.status === 'inactive') continue;
    const timezone = lease.property?.timezone || 'Asia/Manila';
    const end = parseCalendarDate(lease.leaseEnd, timezone);
    const daysLeft = calendarDaysBetween(propertyToday(now, timezone), end);
    if (!LEASE_NOTICE_DAYS.includes(daysLeft)) continue;
    const place = `${lease.unit?.label || 'Unit'}, ${lease.property?.name || 'property'}`;

    if (await notifyOnce({
      dedupeKey: `lease-expiry:${lease._id}:${end}:${daysLeft}:tenant`,
      userId: lease.tenant,
      title: `Your lease ends in ${daysLeft} days`,
      body: `Your lease for ${place} ends on ${end}. Open Lease to request a renewal or plan your move-out.`,
      type: 'lease', refModel: 'Lease', refId: lease._id, pushCategory: 'lease', url: '/tenant/lease',
    })) created += 1;

    if (landlords.get(String(lease.landlord))?.preferences?.alerts?.leaseExpiration !== false) {
      if (await notifyOnce({
        dedupeKey: `lease-expiry:${lease._id}:${end}:${daysLeft}:landlord`,
        userId: lease.landlord,
        title: `Lease ends in ${daysLeft} days`,
        body: `The lease for ${place} ends on ${end}.`,
        type: 'lease', refModel: 'Lease', refId: lease._id, url: '/dashboard-tenants',
      })) created += 1;
    }
  }
  return { created };
}

function wantsDigest(user) {
  if (user.role === 'tenant') return user.preferences?.emailDigest?.enabled === true;
  if (user.role === 'landlord') return user.preferences?.alerts?.dailySummaryEmail === true;
  return false;
}

function includeInDigest(user, notification) {
  if (user.role !== 'tenant') return true;
  const category = TYPE_TO_CATEGORY[notification.type];
  // Tenants choose email per category; uncategorized system notices are always included.
  return !category || user.preferences?.notifications?.[category]?.email !== false;
}

/** Opt-in daily email listing the last day's in-app notifications. Needs SMTP. */
export async function runEmailDigests(now = new Date()) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return { sent: 0, skipped: 'smtp_not_configured' };
  const users = await User.find({
    role: { $in: ['tenant', 'landlord'] },
    status: { $ne: 'suspended' },
    $or: [{ 'preferences.emailDigest.enabled': true }, { 'preferences.alerts.dailySummaryEmail': true }],
  }).select('role email firstName timezone preferences status').lean();

  let sent = 0;
  for (const user of users) {
    if (!wantsDigest(user) || !user.email) continue;
    const local = localParts(now, user.preferences?.timezone || user.timezone);
    if (local.minutes < DIGEST_LOCAL_MINUTES) continue;

    let claim;
    try {
      claim = await ScheduledDelivery.create({ key: `digest:${user._id}:${local.date}`, kind: 'digest', user: user._id, status: 'sending' });
    } catch (error) {
      if (error.code === 11000) continue; // already handled today (possibly by another worker)
      throw error;
    }

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const items = (await Notification.find({ user: user._id, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(50).lean())
      .filter((notification) => includeInDigest(user, notification));
    if (!items.length) {
      claim.status = 'skipped';
      await claim.save();
      continue;
    }

    const rows = items.map((n) => `<li style="margin:0 0 12px"><strong>${escapeHtml(n.title)}</strong><br><span style="color:#475569">${escapeHtml(n.body)}</span></li>`).join('');
    try {
      await sendEmail({
        to: user.email,
        subject: `Your JPTL summary: ${items.length} ${items.length === 1 ? 'update' : 'updates'}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px"><p>Hi ${escapeHtml(user.firstName || 'there')},</p><p>Here is what happened in JPTL over the last day:</p><ul style="padding-left:18px">${rows}</ul><p style="color:#64748b;font-size:12px">You get this email because daily summaries are on in your JPTL settings.</p></div>`,
      });
      claim.status = 'sent';
      claim.sentAt = new Date();
      claim.payload = { count: items.length };
      sent += 1;
    } catch (error) {
      claim.status = 'failed';
      claim.error = error.message;
    }
    await claim.save();
  }
  return { sent };
}

export async function runReminderTick(now = new Date()) {
  const steps = { flushDeferredPushes, runRentReminders, runLeaseExpiryReminders, runComplianceExpirationReminders, runEmailDigests, runSubscriptionLifecycle };
  const results = {};
  for (const [name, step] of Object.entries(steps)) {
    try {
      results[name] = await step(now);
    } catch (error) {
      console.error(`Reminder step ${name} failed:`, error.message);
      results[name] = { error: error.message };
    }
  }
  return results;
}

export function startReminderScheduler() {
  if (schedulerInterval || process.env.NODE_ENV === 'test') return;
  // Opt-in outside production, so a local server pointed at a shared database
  // doesn't send real tenants reminders.
  if (process.env.NODE_ENV !== 'production' && process.env.REMINDERS_ENABLED !== 'true') {
    console.log('[Reminders] Scheduler off (set REMINDERS_ENABLED=true to run it outside production).');
    return;
  }
  const run = () => runReminderTick().catch((error) => console.error('Reminder tick failed:', error));
  run();
  schedulerInterval = setInterval(run, TICK_MS);
  schedulerInterval.unref?.();
}
