import { Router } from 'express';
import crypto from 'crypto';
import { runReminderTick } from '../../shared/services/reminderScheduler.service.js';

// Lets an external cron (e.g. Vercel Cron) run background jobs on serverless
// hosts, where the in-process interval scheduler does not run.
// Requires `Authorization: Bearer <CRON_SECRET>`; disabled when CRON_SECRET is unset.
const router = Router();

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.get('authorization') || '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

router.get('/reminders', async (req, res) => {
  if (!authorized(req)) return res.status(404).json({ success: false, message: 'Not found' });
  const results = await runReminderTick();
  return res.status(200).json({ success: true, data: results });
});

export default router;
