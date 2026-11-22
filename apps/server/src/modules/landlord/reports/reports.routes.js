import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as reports from './reports.service.js';

const router = Router();
router.use(requireAuth, requireRole('landlord'));

const landlordId = (req) => req.user._id || req.user.id;
const fail = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

// Monthly income summary per property (JSON for the Reports page).
router.get('/income-summary', async (req, res) => {
  try { return res.json({ success: true, data: await reports.incomeSummary(landlordId(req), req.query) }); } catch (err) { return fail(res, err); }
});

// CSV downloads: rent-roll, income-summary, tenants, maintenance, utility-bills.
router.get('/:report/export', async (req, res) => {
  try {
    const { filename, csv } = await reports.exportCsv(landlordId(req), req.params.report, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) { return fail(res, err); }
});

export default router;
