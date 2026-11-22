import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as bills from '../../../shared/services/utilityBill.service.js';

// Landlord-only: utility bills create tenant charges, like invoices.
const router = Router();
router.use(requireAuth, requireRole('landlord'));

const handle = (fn, status = 200) => async (req, res) => {
  try {
    return res.status(status).json({ success: true, data: await fn(req.user._id || req.user.id, req) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

router.get('/', handle((id, req) => bills.listBills(id, req.query)));
router.patch('/charge-mode', handle((id, req) => bills.setUtilityChargeMode(id, req.body)));
router.post('/', handle((id, req) => bills.createDraftBill(id, req.body), 201));
router.patch('/:id/allocations/:allocationId', handle((id, req) => bills.adjustDraftAllocation(id, req.params.id, req.params.allocationId, req.body)));
router.post('/:id/post', handle((id, req) => bills.postBill(id, req.params.id)));
router.post('/:id/void', handle((id, req) => bills.voidBill(id, req.params.id, req.body)));

export default router;
