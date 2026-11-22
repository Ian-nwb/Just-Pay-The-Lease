import { Router } from 'express';
import {
  getTenantDirectory,
  getTenantDetails,
  createTenant,
  reviewTenantApproval,
  updateTenant,
  deleteTenant,
} from './tenantdirectory.controller.js';
import { requireAuth, requireRole, requireStaffType } from '../../../shared/middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);

// GET /api/landlord/tenantdirectory - List all tenants with search/status filters
router.get('/', requireRole('landlord'), getTenantDirectory);

// GET /api/landlord/tenantdirectory/:id - Get single tenant detailed profile
router.get('/:id', requireRole('landlord'), getTenantDetails);

// POST /api/landlord/tenantdirectory - Create / Pre-add tenant
router.post('/', requireRole('landlord', 'staff'), (req, res, next) => req.user.role === 'staff' ? requireStaffType('property_manager')(req, res, next) : next(), createTenant);

router.patch('/:id/approval', requireRole('landlord'), reviewTenantApproval);

// PUT /api/landlord/tenantdirectory/:id - Update tenant / lease / unit assignment
router.put('/:id', requireRole('landlord'), updateTenant);

// DELETE /api/landlord/tenantdirectory/:id - Remove tenant and release unit
router.delete('/:id', requireRole('landlord'), deleteTenant);

export default router;
