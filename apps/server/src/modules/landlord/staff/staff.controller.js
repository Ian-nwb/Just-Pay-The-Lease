import * as staffService from './staff.service.js';
import { getStaffPropertyScope } from '../../../shared/utils/staffPropertyScope.js';

export async function listTechnicians(req, res) {
  try {
    const propertyIds = req.user.role === 'staff'
      ? (await getStaffPropertyScope(req.user))?.propertyIds || []
      : null;
    const staff = await staffService.listTechnicians(req.user.landlord || req.user.id || req.user._id, propertyIds);
    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function listStaff(req, res) {
  try {
    const staff = await staffService.listStaff(req.user.id);
    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function inviteStaff(req, res) {
  try {
    const staff = await staffService.inviteStaff(req.user.id, req.body);
    return res.status(201).json({ success: true, data: staff });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function deactivateStaff(req, res) {
  try {
    const staff = await staffService.deactivateStaff(req.user.id, req.params.id);
    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function reactivateStaff(req, res) {
  try {
    const staff = await staffService.reactivateStaff(req.user.id || req.user._id, req.params.id);
    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

export async function updateStaffAccess(req, res) {
  try {
    const staff = await staffService.updateStaffAccess(req.user.id || req.user._id, req.params.id, req.body);
    return res.status(200).json({ success: true, data: staff });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}
