import mongoose from 'mongoose';

// One row per deferred push or per claimed once-only delivery (e.g. a daily digest).
// `key` is unique so several server workers cannot send the same delivery twice.
const scheduledDeliverySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['push', 'digest'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    sendAfter: { type: Date, default: Date.now },
    status: { type: String, enum: ['queued', 'sending', 'sent', 'skipped', 'failed'], default: 'queued' },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

scheduledDeliverySchema.index({ kind: 1, status: 1, sendAfter: 1 });

export default mongoose.model('ScheduledDelivery', scheduledDeliverySchema);
