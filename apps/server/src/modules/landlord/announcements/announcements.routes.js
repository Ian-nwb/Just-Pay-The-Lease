import { Router } from 'express';
import { createAnnouncement, getMyAnnouncements, deleteAnnouncement } from './announcements.controller.js';
import { requireAuth, requireRole, requireStaffType } from '../../../shared/middleware/auth.middleware.js';

const router = Router();

// Restrict entire router to landlords
router.use(requireAuth);
const propertyManagerOnly = (req, res, next) => req.user?.role === 'staff' ? requireStaffType('property_manager')(req, res, next) : next();

// GET /api/landlord/announcements (Fetches only this landlord's notices)
router.get('/', requireRole('landlord', 'staff'), propertyManagerOnly, getMyAnnouncements);

// POST /api/landlord/announcements
router.post('/', requireRole('landlord', 'staff'), propertyManagerOnly, createAnnouncement);

// DELETE /api/landlord/announcements/:id
router.delete('/:id', requireRole('landlord'), deleteAnnouncement);

export default router;
