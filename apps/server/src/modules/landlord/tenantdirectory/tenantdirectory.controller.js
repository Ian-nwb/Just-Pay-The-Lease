import * as tenantDirectoryService from './tenantdirectory.service.js';

export async function getTenantDirectory(req, res) {
  try {
    const landlordId = req.user.id;
    const result = await tenantDirectoryService.getTenantDirectory(landlordId, req.query);
    return res.status(200).json({
      success: true,
      summary: result.summary,
      count: result.tenants.length,
      data: result.tenants,
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function getTenantDetails(req, res) {
  try {
    const landlordId = req.user.id;
    const { id } = req.params;
    const tenant = await tenantDirectoryService.getTenantDetails(landlordId, id);
    return res.status(200).json({ success: true, data: tenant });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function createTenant(req, res) {
  try {
    const isManagerRequest = req.user.role === 'staff';
    const landlordId = isManagerRequest ? req.user.landlord : (req.user.id || req.user._id);
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const options = isManagerRequest ? { approvalRequestedBy: req.user.id || req.user._id, allowedPropertyIds: req.user.propertyAssignments || [] } : {};
    const tenant = await tenantDirectoryService.createTenant(landlordId, req.body, ipAddress, options);
    return res.status(201).json({
      success: true,
      message: isManagerRequest ? 'Tenant request sent to the landlord for approval.' : 'Tenant created successfully',
      data: tenant,
    });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function reviewTenantApproval(req, res) {
  try {
    const result = await tenantDirectoryService.reviewTenantApproval(req.user.id || req.user._id, req.params.id, req.body.decision, req.user.id || req.user._id, req.ip || '');
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
}

export async function updateTenant(req, res) {
  try {
    const landlordId = req.user.id;
    const { id } = req.params;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const updated = await tenantDirectoryService.updateTenant(landlordId, id, req.body, ipAddress);
    return res.status(200).json({
      success: true,
      message: 'Tenant updated successfully',
      data: updated,
    });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function deleteTenant(req, res) {
  try {
    const landlordId = req.user.id;
    const { id } = req.params;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const result = await tenantDirectoryService.deleteTenant(landlordId, id, ipAddress);
    return res.status(200).json({ success: true, message: result.message });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}
