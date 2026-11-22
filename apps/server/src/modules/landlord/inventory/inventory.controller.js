import * as inventory from '../../../shared/services/inventory.service.js';
import { getLandlordScopeId } from '../../../shared/utils/landlordScope.js';
import { getStaffPropertyScope } from '../../../shared/utils/staffPropertyScope.js';

async function respond(res, fn, status = 200) {
  try { return res.status(status).json({ success: true, data: await fn() }); }
  catch (error) { return res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
}
export const list = (req, res) => respond(res, async () => inventory.listLandlordInventory(getLandlordScopeId(req.user), req.user.role === 'staff' ? await getStaffPropertyScope(req.user) : {}));
export const create = (req, res) => respond(res, async () => inventory.createInventoryItem(getLandlordScopeId(req.user), req.body, req.files || [], req.user.role === 'staff' ? await getStaffPropertyScope(req.user) : {}, req.ip || ''), 201);
