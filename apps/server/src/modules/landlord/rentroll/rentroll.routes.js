import { Router } from 'express';
import {
  getRentRoll,
  getRentRollKpi,
  getPaymentById,
  createPaymentInvoice,
  markPaymentAsPaid,
  reviewPayment,
  getPaymentEvidence,
  updatePayment,
  deletePayment,
  exportRentRoll,
  getPaymentIous,
  reviewPaymentIou,
  reversePaymentAllocation,
} from './rentroll.controller.js';
import { requireAuth, requireRole, requireStaffType } from '../../../shared/middleware/auth.middleware.js';

const router = Router();

// Restrict all rentroll endpoints to authenticated landlords
router.use(requireAuth, requireRole('landlord', 'staff'));
router.use((req, res, next) => req.user.role === 'staff' ? requireStaffType('property_manager')(req, res, next) : next());

// GET /api/landlord/rentroll - Get rent roll transactions & summary
router.get('/', getRentRoll);

// GET /api/landlord/rentroll/kpi - Quick summary KPIs
router.get('/kpi', getRentRollKpi);

// GET /api/landlord/rentroll/export - Export rent roll CSV / data
router.get('/export', exportRentRoll);
router.patch('/ious/:iouId/review', reviewPaymentIou);

// POST /api/landlord/rentroll - Create payment invoice
router.post('/', requireRole('landlord'), createPaymentInvoice);

// GET /api/landlord/rentroll/:id - Get single payment detail
router.get('/:id', getPaymentById);
router.get('/:id/evidence', getPaymentEvidence);
router.get('/:id/ious', getPaymentIous);
router.patch('/:id/review', reviewPayment);

// PATCH /api/landlord/rentroll/:id/mark-paid - Mark payment as paid
router.patch('/:id/mark-paid', requireRole('landlord'), markPaymentAsPaid);

// Reverse a confirmed payment (bounced transfer, entry error). Landlord only; keeps history.
router.patch('/:id/allocations/:allocationId/reverse', requireRole('landlord'), reversePaymentAllocation);

// PUT /api/landlord/rentroll/:id - Update payment details
router.put('/:id', requireRole('landlord'), updatePayment);

// DELETE /api/landlord/rentroll/:id - Delete / void payment invoice
router.delete('/:id', requireRole('landlord'), deletePayment);

export default router;
