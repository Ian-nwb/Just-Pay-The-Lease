import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as tenantDocController from './documents.controller.js';
import { listTenantPolicies, getTenantPolicyFile } from '../../landlord/documents/policies.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

const router = Router();

// Protect all routes: Tenant only
router.use(requireAuth, requireRole('tenant'));

router.get('/', tenantDocController.getDocuments);
router.get('/policies', listTenantPolicies);
router.get('/policies/:policyId/file', getTenantPolicyFile);
router.post('/:id/signature', tenantDocController.signLeaseDocument);
router.get('/:id/signature-image/:role', tenantDocController.getSignatureImage);
router.get('/:id/file', tenantDocController.getDocumentFile);
router.post('/', upload.single('file'), tenantDocController.submitDocument);
router.delete('/:id', tenantDocController.deleteDocument);

export default router;
