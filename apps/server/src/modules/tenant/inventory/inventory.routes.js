import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth.middleware.js';
import { list, respond } from './inventory.controller.js';

const router = Router();
router.use(requireAuth, requireRole('tenant'));
router.get('/', list);
router.patch('/:id/response', respond);
export default router;
