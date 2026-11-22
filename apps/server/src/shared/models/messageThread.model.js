import mongoose from 'mongoose';

const messageThreadSchema = new mongoose.Schema({
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  participantKey: { type: String, required: true, unique: true },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

messageThreadSchema.index({ participants: 1, lastMessageAt: -1 });
export default mongoose.model('MessageThread', messageThreadSchema);
