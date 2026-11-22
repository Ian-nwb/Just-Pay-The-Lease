import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Unit',
      required: true,
    },
    name: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'Lease Agreement', 'Government ID'
    expirationDate: { type: Date, default: null },
    category: {
      type: String,
      enum: ['lease', 'upload', 'receipt'],
      required: true,
    },
    size: { type: String, required: true },
    fileUrl: { type: String, required: true },
    filePublicId: { type: String, default: null },
    fileFormat: { type: String, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['Pending Review', 'Verified', 'Rejected'],
      default: 'Pending Review',
    },
    rejectionReason: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    signaturePlacement: {
      page: { type: Number, min: 1, default: null },
      x: { type: Number, min: 0, max: 1, default: null },
      y: { type: Number, min: 0, max: 1, default: null },
      width: { type: Number, min: 0.05, max: 1, default: 0.24 },
      height: { type: Number, min: 0.03, max: 1, default: 0.08 },
      placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      placedAt: { type: Date, default: null },
    },
    signingRecord: {
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      signedName: { type: String, default: '', maxlength: 120 },
      signedAt: { type: Date, default: null },
      signatureImagePublicId: { type: String, default: null },
    },
    // Landlord (or authorized office) counter-signature, same shape as the tenant fields above.
    landlordSignaturePlacement: {
      page: { type: Number, min: 1, default: null },
      x: { type: Number, min: 0, max: 1, default: null },
      y: { type: Number, min: 0, max: 1, default: null },
      width: { type: Number, min: 0.05, max: 1, default: 0.24 },
      height: { type: Number, min: 0.03, max: 1, default: 0.08 },
      placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      placedAt: { type: Date, default: null },
    },
    landlordSigningRecord: {
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      signedName: { type: String, default: '', maxlength: 120 },
      signedAt: { type: Date, default: null },
      signatureImagePublicId: { type: String, default: null },
    },
    // Separate stamped copy; the original file above is kept unchanged.
    signedFile: {
      publicId: { type: String, default: null },
      format: { type: String, default: null },
      bytes: { type: Number, default: 0 },
      name: { type: String, default: null },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

documentSchema.index({ unit: 1 });
documentSchema.index({ tenant: 1, category: 1 });

export default mongoose.model('Document', documentSchema);
