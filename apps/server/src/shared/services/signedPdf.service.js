import zlib from 'zlib';
// Produces a separate "signed copy" of a lease PDF with the tenant's typed name,
// timestamp and record ID drawn in the landlord-placed signature box.
// The original upload is never modified.
//
// Requires the optional `pdf-lib` package. If it isn't installed, signing still
// records the typed-name signature; only the stamped copy is skipped.
import { fetchCloudinaryFile, getPrivatePaymentAssetUrl, uploadPaymentAssetToCloudinary } from '../config/cloudinary.js';

let pdfLibPromise = null;
async function loadPdfLib() {
  // pdf-lib is CommonJS: depending on interop, its exports sit on the namespace or on `default`.
  if (!pdfLibPromise) pdfLibPromise = import('pdf-lib').then((mod) => (mod.PDFDocument && mod.StandardFonts ? mod : mod.default)).catch(() => null);
  return pdfLibPromise;
}

export async function isSignedPdfAvailable() {
  return Boolean(await loadPdfLib());
}

/** Download a private Cloudinary PDF. Upload type 'auto' may store PDFs as image or raw, so try both. */
export async function fetchPrivatePdf(publicId, format = 'pdf') {
  for (const resourceType of ['image', 'raw']) {
    const url = await getPrivatePaymentAssetUrl(publicId, format, resourceType);
    if (!url) return null;
    const response = await fetch(url);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  }
  return null;
}

const MAX_SIGNATURE_BYTES = 300 * 1024;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export class SignatureImageError extends Error {
  constructor(message) { super(message); this.statusCode = 400; }
}

/** Validate a drawn/uploaded signature (PNG data URL) and store it privately. Returns its public id. */
export async function storeSignatureImage(dataUrl, label = 'signature') {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw new SignatureImageError('Draw or upload your signature before signing.');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 100 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) throw new SignatureImageError('The signature image is not a valid PNG.');
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new SignatureImageError('The signature image is too large.');
  const upload = await uploadPaymentAssetToCloudinary(bytes, `${label}.png`, { privateAsset: true, folder: 'jptl_signatures' });
  return upload.public_id;
}

export async function fetchSignatureImage(publicId) {
  for (const resourceType of ['image', 'raw']) {
    const url = await getPrivatePaymentAssetUrl(publicId, 'png', resourceType);
    if (!url) return null;
    const response = await fetch(url);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  }
  return null;
}

/**
 * Draw the signature onto a copy of `originalBytes`.
 * `placement` uses fractions of the page (0–1) measured from the top-left corner.
 */
/**
 * Bounding box of visible ink in an RGBA 8-bit, non-interlaced PNG (what a
 * browser canvas exports). Returns null for any other format, in which case
 * the whole image is used.
 */
function inkBounds(pngBytes) {
  try {
    let pos = 8; let w = 0; let h = 0; const idat = [];
    while (pos < pngBytes.length) {
      const len = pngBytes.readUInt32BE(pos); const type = pngBytes.toString('ascii', pos + 4, pos + 8);
      const data = pngBytes.subarray(pos + 8, pos + 8 + len);
      if (type === 'IHDR') {
        w = data.readUInt32BE(0); h = data.readUInt32BE(4);
        if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) return null; // need RGBA8, no interlace
      } else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      pos += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * 4; const out = Buffer.alloc(h * stride);
    let minX = w; let minY = h; let maxX = -1; let maxY = -1;
    for (let y = 0; y < h; y++) {
      const filter = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? out[y * stride + i - 4] : 0; const b = y ? out[(y - 1) * stride + i] : 0; const c = y && i >= 4 ? out[(y - 1) * stride + i - 4] : 0;
        let v = line[i];
        if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        out[y * stride + i] = v & 255;
      }
      for (let x = 0; x < w; x++) if (out[y * stride + x * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, imgW: w, imgH: h };
  } catch {
    return null;
  }
}

/**
 * Draw a signature into its box on a copy of the PDF: just the ink, scaled to
 * fit and centred, with no border or caption. Who signed and when is kept in
 * the document's signing record and audit log.
 */
export async function stampSignature(originalBytes, { placement, signedName, signedAt, imageBytes = null }) {
  const pdfLib = await loadPdfLib();
  if (!pdfLib) return null;
  const { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = pdfLib;
  const pdf = await PDFDocument.load(originalBytes);
  const pages = pdf.getPages();
  const page = pages[Math.min(Math.max(1, placement.page), pages.length) - 1];
  const { width, height } = page.getSize();

  const boxW = placement.width * width;
  const boxH = placement.height * height;
  const x = placement.x * width;
  const y = height - placement.y * height - boxH; // PDF origin is bottom-left

  if (imageBytes) {
    const png = await pdf.embedPng(imageBytes);
    const ink = inkBounds(imageBytes) || { x: 0, y: 0, w: png.width, h: png.height, imgW: png.width, imgH: png.height };
    const pad = 2;
    const scale = Math.min((boxW - pad * 2) / ink.w, (boxH - pad * 2) / ink.h);
    const drawnW = ink.w * scale; const drawnH = ink.h * scale;
    const inkLeft = x + (boxW - drawnW) / 2; const inkBottom = y + (boxH - drawnH) / 2;
    // Place the full image so the ink lands centred in the box, clipped to the box.
    page.pushOperators(pushGraphicsState(), rectangle(x, y, boxW, boxH), clip(), endPath());
    page.drawImage(png, {
      x: inkLeft - ink.x * scale,
      y: inkBottom - (ink.imgH - ink.y - ink.h) * scale,
      width: ink.imgW * scale,
      height: ink.imgH * scale,
    });
    page.pushOperators(popGraphicsState());
  } else {
    const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    let size = Math.max(8, Math.min(boxH * 0.6, 24));
    while (size > 6 && script.widthOfTextAtSize(signedName, size) > boxW - 4) size -= 0.5;
    page.drawText(signedName, { x: x + (boxW - script.widthOfTextAtSize(signedName, size)) / 2, y: y + (boxH - size) / 2 + size * 0.2, size, font: script, color: rgb(0.05, 0.1, 0.2) });
  }

  pdf.setModificationDate(signedAt);
  return Buffer.from(await pdf.save());
}

export const isPdfDocument = (doc) => /\.pdf$/i.test(doc?.name || '') || String(doc?.fileFormat || '').toLowerCase() === 'pdf';

async function readOriginal(doc) {
  if (doc.filePublicId) {
    const bytes = await fetchPrivatePdf(doc.filePublicId, doc.fileFormat || 'pdf');
    if (bytes) return bytes;
  }
  if (doc.fileUrl) {
    const file = await fetchCloudinaryFile(doc.fileUrl);
    if (file) return Buffer.from(await new Response(file.stream).arrayBuffer());
  }
  return null;
}

/** Signatures that have both a placed box and a completed signing record. */
function completedSignatures(doc) {
  const out = [];
  if (doc.signaturePlacement?.placedAt && doc.signingRecord?.signedAt) out.push({ placement: doc.signaturePlacement, signedName: doc.signingRecord.signedName, signedAt: doc.signingRecord.signedAt, imageId: doc.signingRecord.signatureImagePublicId, role: 'Resident' });
  if (doc.landlordSignaturePlacement?.placedAt && doc.landlordSigningRecord?.signedAt) out.push({ placement: doc.landlordSignaturePlacement, signedName: doc.landlordSigningRecord.signedName, signedAt: doc.landlordSigningRecord.signedAt, imageId: doc.landlordSigningRecord.signatureImagePublicId, role: 'Landlord' });
  return out;
}

/**
 * (Re)build the signed copy with every completed signature stamped on it.
 * Returns metadata for the uploaded copy, or null when unavailable.
 */
export async function createSignedCopy(doc) {
  const signatures = completedSignatures(doc);
  if (!signatures.length || !isPdfDocument(doc)) return null;
  if (!(await isSignedPdfAvailable())) return null;
  let bytes = await readOriginal(doc);
  if (!bytes) return null;
  for (const sig of signatures) {
    const imageBytes = sig.imageId ? await fetchSignatureImage(sig.imageId) : null;
    bytes = await stampSignature(bytes, { placement: sig.placement, signedName: sig.signedName, signedAt: new Date(sig.signedAt), recordId: `${doc._id} · ${sig.role}`, imageBytes });
    if (!bytes) return null;
  }
  const baseName = String(doc.name || 'document.pdf').replace(/\.pdf$/i, '');
  const upload = await uploadPaymentAssetToCloudinary(bytes, `${baseName}-signed.pdf`, { privateAsset: true, folder: 'jptl_lease_documents_signed' });
  return { publicId: upload.public_id, format: upload.format || 'pdf', bytes: Number(upload.bytes || bytes.length), name: `${baseName} (signed).pdf`, createdAt: new Date() };
}
