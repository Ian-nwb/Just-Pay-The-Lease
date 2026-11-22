import Document from '../../../shared/models/document.model.js';
import Property from '../../../shared/models/property.model.js';
import Unit from '../../../shared/models/unit.model.js';
import User from '../../../shared/models/user.model.js';
import AuditLog from '../../../shared/models/auditLog.model.js';
import { getCloudinaryClient } from '../../../shared/config/cloudinary.js';
import { createNotification } from '../../../shared/services/notification.service.js';
import Lease from '../../../shared/models/lease.model.js';
import { uploadPaymentAssetToCloudinary, getPrivatePaymentAssetUrl, fetchCloudinaryFile } from '../../../shared/config/cloudinary.js';
import { fetchPrivatePdf, isPdfDocument, createSignedCopy, storeSignatureImage, fetchSignatureImage } from '../../../shared/services/signedPdf.service.js';
import { Readable } from 'node:stream';

export class LandlordDocumentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function logAction({ actorId, action, entityKind = 'Document', entityId, beforeState = null, afterState = null, ipAddress = '' }) {
  try {
    await AuditLog.create({
      actor: actorId,
      actorRole: 'landlord',
      action,
      entityKind,
      entityId,
      beforeState,
      afterState,
      ipAddress,
    });
  } catch (err) {
    console.error('Landlord Document AuditLog error:', err.message);
  }
}

function formatReviewer(reviewer) {
  if (!reviewer) return { reviewedBy: null, reviewerName: '' };
  if (typeof reviewer === 'object' && (reviewer.firstName || reviewer.lastName || reviewer.email)) {
    const name = `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim() || reviewer.email || '';
    return { reviewedBy: reviewer._id || null, reviewerName: name };
  }
  return { reviewedBy: reviewer, reviewerName: '' };
}

/**
 * GET all compliance documents across all units owned by landlord
 */
export async function getLandlordDocuments(landlordId, query = {}, context = {}) {
  const { status, type, propertyId, search } = query;

  // 1. Find all properties of this landlord
  const landlordProperties = context.properties || (await Property.find({ landlord: landlordId }).lean());
  const propertyIds = context.propertyIds || landlordProperties.map((p) => p._id);
  const propertyMap = new Map(landlordProperties.map((p) => [p._id.toString(), p]));

  // 2. Find all units under landlord properties
  const unitFilter = { property: { $in: propertyIds } };
  if (propertyId && propertyIds.some((id) => id.toString() === propertyId)) {
    unitFilter.property = propertyId;
  }

  const units = context.units && !propertyId ? context.units : await Unit.find(unitFilter).lean();
  const unitIds = context.unitIds && !propertyId ? context.unitIds : units.map((u) => u._id);
  const unitMap = new Map(units.map((u) => [u._id.toString(), u]));

  // Also query tenants registered under this landlord
  const landlordTenants = context.tenants || (await User.find({ landlord: landlordId }).select('_id').lean());
  const tenantIds = landlordTenants.map((t) => t._id || t.id);

  // 3. Build Document match filter
  const matchFilter = {
    $or: [
      { unit: { $in: unitIds } },
      { tenant: { $in: tenantIds } },
    ],
  };
  if (status && status !== 'all') {
    matchFilter.status = status;
  }
  if (type && type !== 'all') {
    matchFilter.type = type;
  }

  // 4. Query Documents
  const rawDocs = await Document.find(matchFilter)
    .populate('tenant', 'firstName lastName email phone preferences')
    .populate('unit')
    .populate('reviewedBy', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .lean();

  // 5. Format documents with unit label & property name
  let formattedDocs = rawDocs.map((d) => {
    const unitIdStr = (d.unit?._id || d.unit)?.toString();
    const unitDoc = unitMap.get(unitIdStr) || (d.unit && typeof d.unit === 'object' ? d.unit : null);
    const propIdStr = (unitDoc?.property?._id || unitDoc?.property)?.toString();
    const propertyDoc = propIdStr ? propertyMap.get(propIdStr) : null;

    const tenantName = d.tenant
      ? `${d.tenant.firstName || ''} ${d.tenant.lastName || ''}`.trim() || d.tenant.email
      : 'Resident';

    const safeDocument = { ...d, ...formatReviewer(d.reviewedBy), hasSignedCopy: Boolean(d.signedFile?.publicId) };
    delete safeDocument.fileUrl;
    delete safeDocument.filePublicId;
    delete safeDocument.signedFile;
    if (safeDocument.tenant && typeof safeDocument.tenant === 'object') {
      safeDocument.tenant = {
        ...safeDocument.tenant,
        phone: safeDocument.tenant.preferences?.privacy?.showPhoneToLandlord === false ? '' : (safeDocument.tenant.phone || ''),
      };
      delete safeDocument.tenant.preferences;
    }
    return {
      ...safeDocument,
      id: d._id,
      unitId: unitDoc?._id || d.unit,
      unitLabel: unitDoc?.label || 'Unit N/A',
      propertyId: propertyDoc?._id || null,
      propertyName: propertyDoc?.name || 'Property N/A',
      tenantName,
      tenantEmail: d.tenant?.email || '',
      date: d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Recently',
    };
  });

  // 6. Search filter (if provided)
  if (search?.trim()) {
    const s = search.trim().toLowerCase();
    formattedDocs = formattedDocs.filter(
      (d) =>
        d.name?.toLowerCase().includes(s) ||
        d.type?.toLowerCase().includes(s) ||
        d.tenantName?.toLowerCase().includes(s) ||
        d.propertyName?.toLowerCase().includes(s) ||
        d.unitLabel?.toLowerCase().includes(s)
    );
  }

  // 7. Calculate compliance stats
  const totalCount = formattedDocs.length;
  const pendingCount = formattedDocs.filter((d) => d.status === 'Pending Review').length;
  const verifiedCount = formattedDocs.filter((d) => d.status === 'Verified').length;
  const rejectedCount = formattedDocs.filter((d) => d.status === 'Rejected').length;

  return {
    documents: formattedDocs,
    metrics: {
      total: totalCount,
      pendingReview: pendingCount,
      verified: verifiedCount,
      rejected: rejectedCount,
      complianceRate: totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100,
    },
  };
}

/**
 * VERIFY or REJECT compliance document (Landlord)
 */
export async function verifyDocument(landlordId, docId, { status, rejectionReason = '' }, ipAddress = '') {
  if (!['Verified', 'Rejected'].includes(status)) {
    throw new LandlordDocumentError('Status must be either "Verified" or "Rejected"', 400);
  }

  const doc = await Document.findById(docId).populate('unit');
  if (!doc) throw new LandlordDocumentError('Document not found', 404);

  // Validate landlord ownership
  const property = await Property.findOne({ _id: doc.unit?.property, landlord: landlordId }).lean();
  if (!property) throw new LandlordDocumentError('Access denied', 403);

  const beforeState = doc.toObject();

  doc.status = status;
  doc.reviewedBy = landlordId;
  doc.verifiedAt = new Date();
  if (status === 'Rejected') {
    doc.rejectionReason = rejectionReason.trim() || 'Document does not satisfy compliance policy standards';
  } else {
    doc.rejectionReason = '';
  }

  await doc.save();

  await logAction({
    actorId: landlordId,
    action: status === 'Verified' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
    entityId: doc._id,
    beforeState,
    afterState: doc.toObject(),
    ipAddress,
  });

  const reviewer = await User.findById(landlordId).select('firstName lastName email').lean();
  const reviewed = doc.toObject();
  delete reviewed.fileUrl;
  delete reviewed.filePublicId;
  return {
    success: true,
    message: `Document has been marked as ${status}.`,
    document: { ...reviewed, id: doc._id, ...formatReviewer(reviewer ? { ...reviewer, _id: landlordId } : landlordId) },
  };
}

/**
 * DELETE document (Landlord)
 */
export async function deleteDocument(landlordId, docId, ipAddress = '') {
  const doc = await Document.findById(docId).populate('unit');
  if (!doc) throw new LandlordDocumentError('Document not found', 404);

  const property = await Property.findOne({ _id: doc.unit?.property, landlord: landlordId }).lean();
  if (!property) throw new LandlordDocumentError('Access denied', 403);

  const beforeState = doc.toObject();
  await Document.findByIdAndDelete(docId);

  await logAction({
    actorId: landlordId,
    action: 'DOCUMENT_DELETED',
    entityId: docId,
    beforeState,
    afterState: null,
    ipAddress,
  });

  return {
    success: true,
    message: `Document "${doc.name}" removed from compliance vault.`,
    deletedDocId: docId,
  };
}

/**
 * STREAM a document file securely (Landlord)
 */
export async function getDocumentStream(landlordId, documentId, { version } = {}) {
  const doc = await Document.findById(documentId).populate('unit').lean();
  if (!doc) throw new LandlordDocumentError('Document not found', 404);

  // Validate landlord ownership: landlord must own the property of the unit, or tenant must belong to landlord
  const unit = doc.unit ? await Unit.findById(doc.unit._id || doc.unit).populate('property').lean() : null;
  const isOwner = unit?.property?.landlord?.toString() === landlordId.toString();
  const tenant = await User.findById(doc.tenant).lean();
  const isTenantOfLandlord = tenant?.landlord?.toString() === landlordId.toString();

  if (!isOwner && !isTenantOfLandlord) {
    throw new LandlordDocumentError('Unauthorized to access this document', 403);
  }

  if (version === 'signed') {
    const bytes = doc.signedFile?.publicId ? await fetchPrivatePdf(doc.signedFile.publicId, doc.signedFile.format || 'pdf') : null;
    if (!bytes) throw new LandlordDocumentError('No signed copy is available for this document', 404);
    return { stream: Readable.toWeb(Readable.from(bytes)), name: doc.signedFile.name || doc.name, mimeType: 'application/pdf' };
  }

  if (doc.filePublicId && doc.fileFormat) {
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

  throw new LandlordDocumentError('Document file stream unavailable', 404);
}

export async function uploadLeasePdf(landlordId, payload = {}, file, ipAddress = '') {
  if (!file?.buffer || file.buffer.length < 5 || file.buffer.toString('ascii', 0, 5) !== '%PDF-') throw new LandlordDocumentError('Choose a valid PDF lease file', 400);
  if (file.size > 15 * 1024 * 1024) throw new LandlordDocumentError('Lease PDF must be 15 MB or smaller', 400);
  const unit = await Unit.findById(payload.unitId).populate('property', 'landlord name status').lean();
  if (!unit || String(unit.property?.landlord) !== String(landlordId) || unit.property?.status === 'inactive' || !unit.tenant) throw new LandlordDocumentError('Choose an occupied unit in one of your active properties', 404);
  const lease = await Lease.findOne({ landlord: landlordId, unit: unit._id, tenant: unit.tenant, status: { $ne: 'ended' } }).sort({ createdAt: -1 }).lean();
  if (!lease) throw new LandlordDocumentError('An active lease is required before attaching a lease PDF', 409);
  const name = String(payload.name || file.originalname || 'Lease Agreement.pdf').trim();
  if (!name || name.length > 180) throw new LandlordDocumentError('PDF name must be 1–180 characters', 400);
  const upload = await uploadPaymentAssetToCloudinary(file.buffer, file.originalname || name, { privateAsset: true, folder: 'jptl_lease_documents' });
  const doc = await Document.create({
    tenant: unit.tenant, unit: unit._id, name: name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`,
    type: 'Lease Agreement', category: 'lease', size: `${(Number(upload.bytes || file.size) / (1024 * 1024)).toFixed(2)} MB`,
    fileUrl: upload.secure_url, filePublicId: upload.public_id, fileFormat: upload.format || 'pdf', uploadedBy: landlordId, status: 'Pending Review',
  });
  await logAction({ actorId: landlordId, action: 'LEASE_PDF_UPLOADED', entityId: doc._id, afterState: { tenant: unit.tenant, unit: unit._id, name: doc.name }, ipAddress });
  await createNotification({ userId: unit.tenant, title: 'Lease PDF uploaded', body: `${doc.name} is ready for your review.`, type: 'lease', refModel: 'Document', refId: doc._id });
  return { ...doc.toObject(), fileUrl: undefined, tenantName: 'Resident', unitLabel: unit.label, propertyName: unit.property.name, unitId: unit._id };
}

export async function setSignaturePlacement(landlordId, docId, payload = {}, ipAddress = '') {
  const role = payload.role === 'landlord' ? 'landlord' : 'tenant';
  const doc = await Document.findById(docId).populate('unit', 'property');
  if (!doc) throw new LandlordDocumentError('Document not found', 404);
  if (!isPdfDocument(doc)) throw new LandlordDocumentError('Signature boxes can only be placed on PDF documents', 409);
  const property = await Property.findOne({ _id: doc.unit?.property, landlord: landlordId }).select('_id').lean();
  if (!property) throw new LandlordDocumentError('Access denied', 403);
  const signed = role === 'landlord' ? doc.landlordSigningRecord?.signedAt : doc.signingRecord?.signedAt;
  if (signed) throw new LandlordDocumentError('This signature is already signed and can no longer be moved', 409);
  const page = Number(payload.page); const x = Number(payload.x); const y = Number(payload.y);
  const width = Number(payload.width ?? 0.24); const height = Number(payload.height ?? 0.08);
  if (![page, x, y, width, height].every(Number.isFinite) || !Number.isInteger(page) || page < 1 || x < 0 || y < 0 || width < 0.05 || height < 0.03 || x + width > 1 || y + height > 1 || width > 1 || height > 1) throw new LandlordDocumentError('Signature box coordinates must fit within the selected PDF page', 400);
  const placement = { page, x, y, width, height, placedBy: landlordId, placedAt: new Date() };
  if (role === 'landlord') doc.landlordSignaturePlacement = placement; else doc.signaturePlacement = placement;
  await doc.save();
  await logAction({ actorId: landlordId, action: role === 'landlord' ? 'DOCUMENT_LANDLORD_SIGNATURE_BOX_PLACED' : 'DOCUMENT_SIGNATURE_BOX_PLACED', entityId: doc._id, afterState: placement, ipAddress });
  if (role === 'tenant') await createNotification({ userId: doc.tenant, title: 'Document ready for signature', body: `A signature box was placed on ${doc.name}.`, type: 'compliance', refModel: 'Document', refId: doc._id });
  return { documentId: doc._id, role, signaturePlacement: doc.signaturePlacement, landlordSignaturePlacement: doc.landlordSignaturePlacement };
}

/** Landlord counter-signs in their placed box; the signed copy is rebuilt with every completed signature. */
export async function signAsLandlord(landlordId, docId, payload = {}, ipAddress = '') {
  const signedName = String(payload.signedName || '').trim();
  if (!signedName || signedName.length > 120) throw new LandlordDocumentError('Enter your name (up to 120 characters) to sign', 400);
  const doc = await Document.findById(docId).populate('unit', 'property');
  if (!doc) throw new LandlordDocumentError('Document not found', 404);
  const property = await Property.findOne({ _id: doc.unit?.property, landlord: landlordId }).select('_id').lean();
  if (!property) throw new LandlordDocumentError('Access denied', 403);
  if (!doc.landlordSignaturePlacement?.placedAt) throw new LandlordDocumentError('Place your signature box first', 409);
  if (doc.landlordSigningRecord?.signedAt) throw new LandlordDocumentError('You have already signed this document', 409);
  const signatureImagePublicId = await storeSignatureImage(payload.signatureImage, `landlord-${doc._id}`);
  doc.landlordSigningRecord = { signedBy: landlordId, signedName, signedAt: new Date(), signatureImagePublicId };
  await doc.save();
  try {
    const signedFile = await createSignedCopy(doc);
    if (signedFile) { doc.signedFile = signedFile; await doc.save(); }
  } catch (error) {
    console.error('Could not create stamped signed PDF:', error.message);
  }
  await logAction({ actorId: landlordId, action: 'DOCUMENT_LANDLORD_SIGNED', entityId: doc._id, afterState: { signedName, signedAt: doc.landlordSigningRecord.signedAt }, ipAddress });
  if (doc.tenant) await createNotification({ userId: doc.tenant, title: 'Document signed by landlord', body: `${signedName} signed ${doc.name}.`, type: 'compliance', refModel: 'Document', refId: doc._id });
  return { documentId: doc._id, landlordSigningRecord: doc.landlordSigningRecord, hasSignedCopy: Boolean(doc.signedFile?.publicId) };
}

/** PNG of a completed signature (role: 'tenant' | 'landlord') on one of the landlord's documents. */
export async function getSignatureImage(landlordId, docId, role) {
  const doc = await Document.findById(docId).populate('unit', 'property').lean();
  if (!doc) throw new LandlordDocumentError('Document not found', 404);
  const property = await Property.findOne({ _id: doc.unit?.property, landlord: landlordId }).select('_id').lean();
  if (!property) throw new LandlordDocumentError('Access denied', 403);
  if (!['tenant', 'landlord'].includes(role)) throw new Error('Unknown signer');
  const record = role === 'landlord' ? doc.landlordSigningRecord : doc.signingRecord;
  const bytes = record?.signatureImagePublicId ? await fetchSignatureImage(record.signatureImagePublicId) : null;
  if (!bytes) throw new LandlordDocumentError('No signature image', 404);
  return bytes;
}
