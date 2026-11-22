import mongoose from 'mongoose';

// A landlord-published building document (house rules, addenda, guides).
// Visible to residents of the listed properties while status is 'active'.
const propertyPolicySchema = new mongoose.Schema(
  {
    landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    properties: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true }],
    title: { type: String, required: true, trim: true, maxlength: 140 },
    type: { type: String, enum: ['House Rules', 'Lease Addendum', 'Move-Out Guide', 'Parking Policy', 'General Policy'], required: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    fileName: { type: String, required: true },
    fileBytes: { type: Number, required: true },
    filePublicId: { type: String, required: true },
    fileFormat: { type: String, default: 'pdf' },
    fileResourceType: { type: String, enum: ['image', 'raw'], default: 'image' },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

propertyPolicySchema.index({ properties: 1, status: 1 });

export default mongoose.model('PropertyPolicy', propertyPolicySchema);
