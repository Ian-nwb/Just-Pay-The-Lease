import * as tenantDocService from './documents.service.js';

export async function signLeaseDocument(req, res) {
  try { const data = await tenantDocService.signLeaseDocument(req.user.id, req.params.id, req.body, req.ip || ''); return res.json({ success: true, data }); }
  catch (error) { return res.status(error.statusCode || 500).json({ success: false, message: error.message }); }
}

export async function getDocuments(req, res) {
  try {
    const tenantId = req.user._id || req.user.id;
    const result = await tenantDocService.getTenantDocuments(tenantId, req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function submitDocument(req, res) {
  try {
    const tenantId = req.user._id || req.user.id;
    const file = req.file || null;
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const doc = await tenantDocService.submitTenantDocument(tenantId, req.body, file, ipAddress);
    return res.status(201).json({ success: true, message: 'Document submitted for review', data: doc });
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function deleteDocument(req, res) {
  try {
    const tenantId = req.user._id || req.user.id;
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const result = await tenantDocService.deleteTenantDocument(tenantId, req.params.id, ipAddress);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function getDocumentFile(req, res) {
  try {
    const tenantId = req.user._id || req.user.id;
    const { stream, name, mimeType } = await tenantDocService.getDocumentStream(tenantId, req.params.id, { version: req.query.version });
    res.setHeader('Content-Type', mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    const { Readable } = await import('node:stream');
    const nodeStream = Readable.fromWeb(stream);
    return nodeStream.pipe(res);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function getSignatureImage(req, res) {
  try {
    const bytes = await tenantDocService.getSignatureImage(req.user.id || req.user._id, req.params.id, req.params.role);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(bytes);
  } catch (err) { return res.status(err.statusCode || 400).json({ success: false, message: err.message }); }
}
