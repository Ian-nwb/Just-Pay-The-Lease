import * as landlordDocService from './documents.service.js';
import { getComplianceReminderSettings, updateComplianceReminderSettings } from '../../../shared/services/complianceReminder.service.js';

export async function getReminderSettings(req, res) {
  try {
    const settings = await getComplianceReminderSettings(req.user._id || req.user.id);
    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

export async function updateReminderSettings(req, res) {
  try {
    const settings = await updateComplianceReminderSettings(req.user._id || req.user.id, req.body.noticeLeadTimeDays);
    return res.status(200).json({ success: true, data: settings });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

export async function getDocuments(req, res) {
  try {
    const landlordId = req.user._id || req.user.id;
    const result = await landlordDocService.getLandlordDocuments(landlordId, req.query);
    return res.status(200).json({ success: true, data: result.documents, documents: result.documents, ...result });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function verifyDocument(req, res) {
  try {
    const landlordId = req.user._id || req.user.id;
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const result = await landlordDocService.verifyDocument(landlordId, req.params.id, req.body, ipAddress);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function deleteDocument(req, res) {
  try {
    const landlordId = req.user._id || req.user.id;
    const ipAddress = req.ip || req.connection?.remoteAddress || '';
    const result = await landlordDocService.deleteDocument(landlordId, req.params.id, ipAddress);
    return res.status(200).json(result);
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({ success: false, message: err.message });
  }
}

export async function getDocumentFile(req, res) {
  try {
    const landlordId = req.user._id || req.user.id;
    const { stream, name, mimeType } = await landlordDocService.getDocumentStream(landlordId, req.params.id, { version: req.query.version });
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

export async function setSignaturePlacement(req, res) {
  try {
    const result = await landlordDocService.setSignaturePlacement(req.user._id || req.user.id, req.params.id, req.body, req.ip || '');
    return res.status(200).json({ success: true, data: result });
  } catch (err) { return res.status(err.statusCode || 400).json({ success: false, message: err.message }); }
}

export async function uploadLeasePdf(req, res) {
  try {
    const result = await landlordDocService.uploadLeasePdf(req.user._id || req.user.id, req.body, req.file, req.ip || '');
    return res.status(201).json({ success: true, data: result });
  } catch (err) { return res.status(err.statusCode || 400).json({ success: false, message: err.message }); }
}

export async function signAsLandlord(req, res) {
  try {
    const data = await landlordDocService.signAsLandlord(req.user._id || req.user.id, req.params.id, req.body, req.ip || '');
    return res.status(200).json({ success: true, data });
  } catch (err) { return res.status(err.statusCode || 400).json({ success: false, message: err.message }); }
}

export async function getSignatureImage(req, res) {
  try {
    const bytes = await landlordDocService.getSignatureImage(req.user._id || req.user.id, req.params.id, req.params.role);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(bytes);
  } catch (err) { return res.status(err.statusCode || 400).json({ success: false, message: err.message }); }
}
