import { Router } from 'express';
import { requireAuth, requireRole, requireStaffType } from '../../../shared/middleware/auth.middleware.js';
import * as staffController from './staff.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/technicians', requireRole('landlord', 'staff'), (req, res, next) => req.user.role === 'staff' ? requireStaffType('property_manager')(req, res, next) : next(), staffController.listTechnicians);
router.get('/', requireRole('landlord'), staffController.listStaff);
router.post('/', requireRole('landlord'), staffController.inviteStaff);
router.put('/:id', requireRole('landlord'), staffController.updateStaffAccess);
router.patch('/:id/reactivate', requireRole('landlord'), staffController.reactivateStaff);
router.delete('/:id', requireRole('landlord'), staffController.deactivateStaff);

export default router;
