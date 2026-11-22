import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.js';
import { paymongoConfig } from '../../shared/services/paymongo/paymongo.client.js';
import * as subscription from '../../shared/services/paymongo/subscription.service.js';
import * as payouts from '../../shared/services/paymongo/payouts.service.js';
import * as rent from '../../shared/services/paymongo/rentCollection.service.js';

const router = Router();
const handle = (fn, status = 200) => async (req, res) => {
  try { return res.status(status).json({ success: true, data: await fn(req.user.id || req.user._id, req) }); }
  catch (err) { return res.status(err.statusCode || 500).json({ success: false, message: err.message }); }
};

router.use(requireAuth);

// Which online-payment features this server has turned on (no secrets).
router.get('/config', (req, res) => {
  const { subscriptions, qrph, payouts: payoutsOn, livemode } = paymongoConfig();
  res.json({ success: true, data: { subscriptions, qrph, payouts: payoutsOn, livemode } });
});

// Landlord: JPTL subscription
router.get('/subscription', requireRole('landlord'), handle((id) => subscription.getBillingOverview(id)));
router.post('/subscription/checkout', requireRole('landlord'), handle((id) => subscription.createProCheckout(id), 201));
router.patch('/subscription/cancel', requireRole('landlord'), handle((id, req) => subscription.cancelAtPeriodEnd(id, req.body?.cancel !== false)));

// Landlord: payouts of QR Ph rent
router.get('/payouts', requireRole('landlord'), handle((id) => payouts.getPayoutOverview(id)));
router.put('/payouts/account', requireRole('landlord'), handle((id, req) => payouts.savePayoutAccount(id, req.body)));
router.post('/payouts', requireRole('landlord'), handle((id) => payouts.requestPayout(id), 201));

// Tenant: QR Ph rent
router.post('/rent/:paymentId/qrph', requireRole('tenant'), handle((id, req) => rent.createQrPhCharge(id, req.params.paymentId), 201));
router.get('/rent/collections/:collectionId', requireRole('tenant'), handle((id, req) => rent.getCollectionStatus(id, req.params.collectionId)));

export default router;
