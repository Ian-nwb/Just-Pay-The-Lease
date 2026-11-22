import mongoose from 'mongoose';

// A shared-meter source bill (one property, one utility, one month) split into
// per-unit invoices. The unique partial index blocks posting the same bill twice.
const allocationSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  unitLabel: { type: String, default: '' },
  weight: { type: Number, default: 1 },
  amount: { type: Number, required: true, min: 0 },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
}, { _id: true });

const utilityBillSchema = new mongoose.Schema(
  {
    landlord: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    utilityType: { type: String, enum: ['electricity', 'water', 'gas', 'internet', 'other'], required: true },
    periodKey: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ }, // billing month, e.g. 2026-11
    totalAmount: { type: Number, required: true, min: 0.01 },
    sourceReference: { type: String, trim: true, maxlength: 120, default: '' },
    splitMethod: { type: String, enum: ['equal', 'by_share'], required: true },
    dueDate: { type: Date, required: true },
    allocations: [allocationSchema],
    status: { type: String, enum: ['draft', 'posted', 'void'], default: 'draft' },
    postedAt: { type: Date, default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: '' },
    history: [{
      action: { type: String, required: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, required: true },
      note: { type: String, default: '' },
    }],
  },
  { timestamps: true }
);

utilityBillSchema.index(
  { property: 1, utilityType: 1, periodKey: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['draft', 'posted'] } } }
);

export default mongoose.model('UtilityBill', utilityBillSchema);
