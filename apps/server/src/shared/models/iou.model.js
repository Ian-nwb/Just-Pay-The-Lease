import mongoose from 'mongoose';

const iouSchema = new mongoose.Schema({
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  amount: { type: Number, required: true, min: 0.01 },
  reason: { type: String, required: true, trim: true, maxlength: 2000 },
  proposedDueDate: { type: Date, required: true },
  originalDueDate: { type: Date, required: true },
  appliedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  decisionNote: { type: String, default: '', maxlength: 1000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

iouSchema.index({ payment: 1, tenant: 1, status: 1 });

export default mongoose.model('IOU', iouSchema);
