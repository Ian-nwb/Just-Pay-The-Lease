import Document from '../../../shared/models/document.model.js';
import Unit from '../../../shared/models/unit.model.js';
import Property from '../../../shared/models/property.model.js';
import User from '../../../shared/models/user.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import { fetchCloudinaryFile, getCloudinaryClient, uploadDocumentToCloudinary } from '../../../shared/config/cloudinary.js';
import { createNotification } from '../../../shared/services/notification.service.js';
import { createSignedCopy, fetchPrivatePdf, isPdfDocument, storeSignatureImage, fetchSignatureImage } from '../../../shared/services/signedPdf.service.js';
import { Readable } from 'node:stream';
import { assertTenantAssigned } from '../../../shared/services/tenantLeaseAccess.service.js';

export class DocumentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function logAction({ actorId, action, entityKind = 'Document', entityId, beforeState = null, afterState = null, ipAddress = '' }) {
  try {
    await AuditLog.create({
      actor: actorId,
      actorRole: 'tenant',
      action,
      entityKind,
      entityId,
      beforeState,
      afterState,
      ipAddress,
    });
  } catch (err) {
    console.error('Tenant Document AuditLog error:', err.message);
  }
}

/**
 * GET all documents submitted by or associated with tenant
 */
export async function getTenantDocuments(tenantId, query = {}) {
  const { status, type } = query;

  const matchFilter = { tenant: tenantId };
  if (status && status !== 'all') {
    matchFilter.status = status;
  }
  if (type && type !== 'all') {
    matchFilter.type = type;
  }

  const rawDocs = await Document.find(matchFilter)
    .populate('unit')
    .populate('tenant', 'firstName lastName email')
    .populate('reviewedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  const propertyIds = rawDocs.map((d) => d.unit?.property).filter(Boolean);
  const properties = await Property.find({ _id: { $in: propertyIds } }).lean();
  const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

  const formattedDocs = rawDocs.map((d) => {
    const prop = d.unit?.property ? propertyMap.get(d.unit.property.toString()) : null;
    const tenantName = d.tenant
      ? `${d.tenant.firstName || ''} ${d.tenant.lastName || ''}`.trim() || d.tenant.email
      : 'Resident';
    const safeDocument = { ...d, hasSignedCopy: Boolean(d.signedFile?.publicId) };
    delete safeDocument.fileUrl;
    delete safeDocument.filePublicId;
    delete safeDocument.signedFile;
    const reviewer = d.reviewedBy && typeof d.reviewedBy === 'object' ? d.reviewedBy : null;
    return {
      ...safeDocument,
      reviewedBy: reviewer?._id || d.reviewedBy || null,
      reviewerName: reviewer ? `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim() : '',
      id: d._id,
      tenantId: d.tenant?._id || d.tenant,
      tenantName,
      unitLabel: d.unit?.label || 'Unit N/A',
      propertyName: prop?.name || 'Property N/A',
      date: d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Recently',
    };
  });

  const totalCount = formattedDocs.length;
  const verifiedCount = formattedDocs.filter((d) => d.status === 'Verified').length;
  const pendingCount = formattedDocs.filter((d) => d.status === 'Pending Review').length;
  const rejectedCount = formattedDocs.filter((d) => d.status === 'Rejected').length;

  return {
    documents: formattedDocs,
    metrics: {
      total: totalCount,
      verified: verifiedCount,
      pending: pendingCount,
      rejected: rejectedCount,
    },
  };
}

/**
 * SUBMIT a compliance / verification document (Tenant)
 */
export async function submitTenantDocument(tenantId, payload, file = null, ipAddress = '') {
  await assertTenantAssigned(tenantId);
  const { name, type = 'Proof of Insurance', category = 'upload', notes = '', fileSize, fileUrl, expirationDate } = payload;
  if (category === 'lease' && !file?.buffer) throw new DocumentError('Upload the lease PDF before requesting a signature', 400);

  if (!type?.trim()) {
    throw new DocumentError('Document classification / type is required', 400);
  }
  const requiresExpiration = /renter insurance|proof of insurance|occupancy permit/i.test(type);
  const parsedExpiration = expirationDate ? new Date(expirationDate) : null;
  if (requiresExpiration && (!parsedExpiration || Number.isNaN(parsedExpiration.getTime()))) {
    throw new DocumentError('A valid expiration date is required for renter insurance and occupancy permits.', 400);
  }

  // Find tenant unit
  let targetUnit = await Unit.findOne({ tenant: tenantId }).lean();
  if (!targetUnit) {
    throw new DocumentError('No active unit assigned to your tenant account to attach document', 400);
  }

  // Handle file upload to Cloudinary (or fallback)
  let resolvedUrl = fileUrl || '';
  let resolvedSize = fileSize || '1.4 MB';

  if (file && file.buffer) {
    if (category === 'lease' && (file.buffer.length < 5 || file.buffer.toString('ascii', 0, 5) !== '%PDF-')) throw new DocumentError('Lease signing documents must be PDF files', 400);
    const uploadResult = await uploadDocumentToCloudinary(file.buffer, file.originalname || name || 'document.pdf');
    resolvedUrl = uploadResult.secure_url;
    resolvedSize = `${(uploadResult.bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else if (!resolvedUrl) {
    // Generate default secure mock asset URL
    const docName = (name || type).replace(/\s+/g, '_');
    resolvedUrl = `https://res.cloudinary.com/demo/image/upload/v${Date.now()}/jptl_vault/${docName}.pdf`;
  }

  const docName = name?.trim() || `${type.replace(/\s+/g, '_')}_Document.pdf`;

  const newDoc = await Document.create({
    tenant: tenantId,
    unit: targetUnit._id,
    name: docName,
    type: type.trim(),
    expirationDate: parsedExpiration,
    category: ['lease', 'upload', 'receipt'].includes(category) ? category : 'upload',
    size: resolvedSize,
    fileUrl: resolvedUrl,
    status: 'Pending Review',
  });

  await logAction({
    actorId: tenantId,
    action: 'DOCUMENT_SUBMITTED',
    entityId: newDoc._id,
    afterState: newDoc.toObject(),
    ipAddress,
  });

  const tenantUser = await User.findById(tenantId).lean();
  const tenantName = tenantUser
    ? `${tenantUser.firstName || ''} ${tenantUser.lastName || ''}`.trim() || tenantUser.email
    : 'Resident';
  const prop = targetUnit.property ? await Property.findById(targetUnit.property).lean() : null;

  return {
    ...newDoc.toObject(),
    id: newDoc._id,
    tenantId,
    tenantName,
    unitLabel: targetUnit.label,
    propertyName: prop?.name || 'Property N/A',
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    notes,
  };
}

export async function signLeaseDocument(tenantId, documentId, payload = {}, ipAddress = '') {
  // payload: { signedName, signatureImage: PNG data URL (drawn or uploaded) }
  const signedName = String(payload.signedName || '').trim();
  if (!signedName || signedName.length > 120) throw new DocumentError('Enter your name (up to 120 characters) to sign this PDF', 400);
  await assertTenantAssigned(tenantId);
  const doc = await Document.findOne({ _id: documentId, tenant: tenantId }).populate('unit', 'property');
  if (!doc) throw new DocumentError('Document not found or access denied', 404);
  if (!isPdfDocument(doc) || !doc.signaturePlacement?.placedAt) throw new DocumentError('This PDF is not ready for signature', 409);
  if (doc.signingRecord?.signedAt) throw new DocumentError('This document has already been signed', 409);
  const signatureImagePublicId = await storeSignatureImage(payload.signatureImage, `tenant-${doc._id}`);
  doc.signingRecord = { signedBy: tenantId, signedName, signedAt: new Date(), signatureImagePublicId };
  await doc.save();
  // The stamped copy is best-effort: the signing record above is the source of truth.
  try {
    const signedFile = await createSignedCopy(doc);
    if (signedFile) {
      doc.signedFile = signedFile;
      await doc.save();
    }
  } catch (error) {
    console.error('Could not create stamped signed PDF:', error.message);
  }
  await logAction({ actorId: tenantId, action: 'LEASE_DOCUMENT_SIGNED', entityId: doc._id, afterState: { signedName, signedAt: doc.signingRecord.signedAt }, ipAddress });
  const property = doc.unit?.property ? await Property.findById(doc.unit.property).select('landlord').lean() : null;
  if (property?.landlord) await createNotification({ userId: property.landlord, title: 'Document signed by resident', body: `${signedName} signed ${doc.name}.`, type: 'compliance', refModel: 'Document', refId: doc._id });
  return { documentId: doc._id, signedName, signedAt: doc.signingRecord.signedAt, hasSignedCopy: Boolean(doc.signedFile?.publicId) };
}

/**
 * DELETE a document (Tenant - only if pending review)
 */
export async function deleteTenantDocument(tenantId, docId, ipAddress = '') {
  const doc = await Document.findOne({ _id: docId, tenant: tenantId });
  if (!doc) throw new DocumentError('Document not found or access denied', 404);

  if (doc.status === 'Verified') {
    throw new DocumentError('Cannot delete a verified compliance document. Please contact your property manager.', 400);
  }

  const beforeState = doc.toObject();
  await Document.findByIdAndDelete(docId);

  await logAction({
    actorId: tenantId,
    action: 'DOCUMENT_DELETED',
    entityId: docId,
    beforeState,
    afterState: null,
    ipAddress,
  });

  return {
    success: true,
    message: `Document "${doc.name}" deleted successfully.`,
    deletedDocId: docId,
  };
}

/**
 * STREAM a document file securely (Tenant)
 */
export async function getDocumentStream(tenantId, documentId, { version } = {}) {
  const doc = await Document.findOne({ _id: documentId, tenant: tenantId }).lean();
  if (!doc) throw new DocumentError('Document not found or access denied', 404);

  if (version === 'signed') {
    const bytes = doc.signedFile?.publicId ? await fetchPrivatePdf(doc.signedFile.publicId, doc.signedFile.format || 'pdf') : null;
    if (!bytes) throw new DocumentError('No signed copy is available for this document', 404);
    return { stream: Readable.toWeb(Readable.from(bytes)), name: doc.signedFile.name || doc.name, mimeType: 'application/pdf' };
  }

  if (doc.filePublicId && doc.fileFormat) {
    const { getPrivatePaymentAssetUrl } = await import('../../../shared/config/cloudinary.js');
    const resourceType = doc.fileFormat.toLowerCase() === 'pdf' ? 'raw' : 'image';
    const downloadUrl = await getPrivatePaymentAssetUrl(doc.filePublicId, doc.fileFormat, resourceType);
    if (downloadUrl) {
      const response = await fetch(downloadUrl);
      if (response.ok) return { stream: response.body, name: doc.name, mimeType: response.headers.get('content-type') || 'application/pdf' };
    }
  }

  if (doc.fileUrl) {
    const file = await fetchCloudinaryFile(doc.fileUrl);
    if (file) return { stream: file.stream, name: doc.name, mimeType: file.mimeType };
  }

  throw new DocumentError('Document file stream unavailable', 404);
}

/** PNG of a completed signature on the tenant's own document. */
export async function getSignatureImage(tenantId, docId, role) {
  const doc = await Document.findOne({ _id: docId, tenant: tenantId }).lean();
  if (!doc) throw new DocumentError('Document not found or access denied', 404);
  if (!['tenant', 'landlord'].includes(role)) throw new Error('Unknown signer');
  const record = role === 'landlord' ? doc.landlordSigningRecord : doc.signingRecord;
  const bytes = record?.signatureImagePublicId ? await fetchSignatureImage(record.signatureImagePublicId) : null;
  if (!bytes) throw new DocumentError('No signature image', 404);
  return bytes;
}
