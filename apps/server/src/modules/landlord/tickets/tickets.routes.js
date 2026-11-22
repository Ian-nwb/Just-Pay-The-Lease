import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, requireStaffType } from '../../../shared/middleware/auth.middleware.js';
import * as ticketController from './tickets.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per photo
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
});

const router = Router();

// Protect all routes: Landlord only
router.use(requireAuth, requireRole('landlord', 'staff'));
const propertyManagerOnly = (req, res, next) => req.user?.role === 'staff' ? requireStaffType('property_manager')(req, res, next) : next();

// Photo upload — must be declared BEFORE /:id routes
router.post('/upload-photos', upload.array('photos', 5), ticketController.uploadPhotos);

router.get('/', ticketController.getTickets);
router.post('/', propertyManagerOnly, ticketController.createTicket);
router.get('/:id', ticketController.getTicketById);
router.patch('/:id/status', ticketController.updateTicketStatus);
router.patch('/:id/assign', propertyManagerOnly, ticketController.assignTechnician);
router.delete('/:id', propertyManagerOnly, ticketController.deleteTicket);

export default router;
