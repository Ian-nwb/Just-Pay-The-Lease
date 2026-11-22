import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    actorRole: { type: String, required: true },
    action: { type: String, required: true }, // e.g. "TICKET_STATUS_UPDATE"
    entityKind: {
      type: String,
      enum: ['Ticket', 'Payment', 'Document', 'Unit', 'Property', 'User', 'Announcement', 'Onboarding', 'Lease', 'EvictionNotice', 'PaymentOption', 'PropertyPolicy', 'UtilityBill', 'InventoryItem', 'MessageThread', 'PaymentIou'],
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ipAddress: { type: String, default: '' },
    reason: { type: String, trim: true, maxlength: 250, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ entityId: 1, entityKind: 1 });

export default mongoose.model('AuditLog', auditLogSchema);
