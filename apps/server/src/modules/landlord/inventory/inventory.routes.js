import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, requireStaffType } from '../../../shared/middleware/auth.middleware.js';
import { list, create } from './inventory.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8 } });
router.use(requireAuth, requireRole('landlord', 'staff'));
router.use((req, res, next) => req.user.role === 'staff' ? requireStaffType('property_manager')(req, res, next) : next());
router.get('/', list);
router.post('/', upload.array('photos', 8), create);
export default router;
