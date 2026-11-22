import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth.middleware.js';
import multer from 'multer';
import * as propertyController from './properties.controller.js';

const router = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Protect all routes: Landlord only
router.use(requireAuth, requireRole('landlord'));

// Property routes
router.get('/', propertyController.getProperties);
router.post('/', propertyController.createProperty);
router.get('/:id', propertyController.getPropertyById);
router.put('/:id', propertyController.updateProperty);
router.post('/:id/image', imageUpload.single('image'), propertyController.updatePropertyImage);
router.delete('/:id', propertyController.deleteProperty);

// Unit nested routes
router.post('/:id/units', propertyController.addUnit);
router.delete('/:propertyId/units/:unitId', propertyController.deleteUnit);

export default router;
