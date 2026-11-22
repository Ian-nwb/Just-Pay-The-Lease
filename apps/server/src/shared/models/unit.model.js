import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true }, // e.g. "Unit 14B"
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    monthlyRent: { type: Number, required: true },
    hasParking: { type: Boolean, default: false },
    parkingSpot: { type: String, default: null },
    parkingFee: { type: Number, default: 0 },
    utilityBilling: [{
      utilityType: { type: String, enum: ['electricity', 'water', 'gas', 'internet', 'other'], required: true },
      billingMode: { type: String, enum: ['separate_meter', 'shared_meter'], required: true },
      monthlyShare: { type: Number, default: 0, min: 0 },
      // fixed_in_rent: monthlyShare is added to each rent invoice.
      // actual_bill: charged from posted source bills (UtilityBill); monthlyShare is only a split weight.
      chargeMode: { type: String, enum: ['fixed_in_rent', 'actual_bill'], default: 'fixed_in_rent' },
      notes: { type: String, default: '', maxlength: 300 },
    }],
    petsAllowed: { type: Boolean, default: null },
    bedrooms: { type: Number, default: 0 },
    bathrooms: { type: Number, default: 1 },
    sqft: { type: Number, required: true },
    status: {
      type: String,
      enum: ['occupied', 'vacant', 'maintenance'],
      default: 'vacant',
    },
    isActive: { type: Boolean, default: true, index: true },
    leaseStart: { type: Date, default: null },
    leaseType: { type: String, enum: ['fixed_term', 'indefinite'], default: 'fixed_term' },
    leaseEnd: { type: Date, default: null },
  },
  { timestamps: true }
);

unitSchema.index({ property: 1 });
unitSchema.index({ tenant: 1 });

export default mongoose.model('Unit', unitSchema);
