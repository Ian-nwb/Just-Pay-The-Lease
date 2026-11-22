import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.js';
import { listThreads, listContacts, createThread, getThread, sendMessage } from './messages.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
router.use(requireAuth, requireRole('tenant', 'landlord', 'staff'));
router.get('/threads', listThreads);
router.get('/contacts', listContacts);
router.post('/threads', createThread);
router.get('/threads/:id', getThread);
router.post('/threads/:id/messages', upload.single('attachment'), sendMessage);
export default router;
