import * as inventory from '../../../shared/services/inventory.service.js';

export async function list(req, res) {
  try { return res.json({ success: true, data: await inventory.getTenantInventory(req.user.id) }); }
  catch (error) { return res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
}
export async function respond(req, res) {
  try { return res.json({ success: true, data: await inventory.respondToInventory(req.user.id, req.params.id, req.body, req.ip || '') }); }
  catch (error) { return res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
}
