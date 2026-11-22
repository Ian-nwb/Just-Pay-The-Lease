import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
  lease: { type: mongoose.Schema.Types.ObjectId, ref: 'Lease', default: null },
  label: { type: String, required: true, trim: true, maxlength: 120 },
  condition: { type: String, required: true, enum: ['new', 'good', 'fair', 'damaged', 'not_working'] },
  notes: { type: String, default: '', maxlength: 2000 },
  photos: [{ url: String, publicId: String, name: String }],
  tenantResponse: { type: String, enum: ['pending', 'confirmed', 'disputed'], default: 'pending' },
  tenantNote: { type: String, default: '', maxlength: 2000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  respondedAt: { type: Date, default: null },
}, { timestamps: true });

inventoryItemSchema.index({ unit: 1, createdAt: -1 });
export default mongoose.model('InventoryItem', inventoryItemSchema);
