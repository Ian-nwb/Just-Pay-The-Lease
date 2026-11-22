import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as landlordDocController from './documents.controller.js';
import * as policyController from './policies.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

// Protect all routes: Landlord only
router.use(requireAuth, requireRole('landlord'));

router.get('/', landlordDocController.getDocuments);
router.get('/reminder-settings', landlordDocController.getReminderSettings);
// Building policies (declared before /:id routes so "policies" is not read as a document id)
router.get('/policies', policyController.listPolicies);
router.post('/policies', upload.single('file'), policyController.publishPolicy);
router.patch('/policies/:policyId/archive', policyController.archivePolicy);
router.get('/policies/:policyId/file', policyController.getPolicyFile);
router.patch('/reminder-settings', landlordDocController.updateReminderSettings);
router.patch('/:id/signature-placement', landlordDocController.setSignaturePlacement);
router.post('/:id/signature', landlordDocController.signAsLandlord);
router.get('/:id/signature-image/:role', landlordDocController.getSignatureImage);
router.post('/lease-pdf', upload.single('file'), landlordDocController.uploadLeasePdf);
router.get('/:id/file', landlordDocController.getDocumentFile);
router.patch('/:id/verify', landlordDocController.verifyDocument);
router.delete('/:id', landlordDocController.deleteDocument);

export default router;
