import { Readable } from 'node:stream';
import * as policyService from '../../../shared/services/propertyPolicy.service.js';

const fail = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

export async function pipePolicyFile(res, file) {
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  return Readable.fromWeb(file.stream).pipe(res);
}

export async function listPolicies(req, res) {
  try { return res.json({ success: true, data: await policyService.listLandlordPolicies(req.user._id || req.user.id) }); } catch (err) { return fail(res, err); }
}

export async function publishPolicy(req, res) {
  try { return res.status(201).json({ success: true, data: await policyService.publishPolicy(req.user._id || req.user.id, req.body, req.file, req.ip || '') }); } catch (err) { return fail(res, err); }
}

export async function archivePolicy(req, res) {
  try { return res.json({ success: true, data: await policyService.archivePolicy(req.user._id || req.user.id, req.params.policyId, req.ip || '') }); } catch (err) { return fail(res, err); }
}

export async function getPolicyFile(req, res) {
  try { return pipePolicyFile(res, await policyService.getLandlordPolicyFile(req.user._id || req.user.id, req.params.policyId)); } catch (err) { return fail(res, err); }
}

export async function listTenantPolicies(req, res) {
  try { return res.json({ success: true, data: await policyService.listTenantPolicies(req.user._id || req.user.id) }); } catch (err) { return fail(res, err); }
}

export async function getTenantPolicyFile(req, res) {
  try { return pipePolicyFile(res, await policyService.getTenantPolicyFile(req.user._id || req.user.id, req.params.policyId)); } catch (err) { return fail(res, err); }
}
