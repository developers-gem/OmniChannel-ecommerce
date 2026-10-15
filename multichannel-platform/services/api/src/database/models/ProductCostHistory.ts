import mongoose, { Schema, Document } from 'mongoose';

export interface IProductCostHistoryDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  canonicalVariantId: mongoose.Types.ObjectId;
  costPrice: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  reason?: string;
  createdAt: Date;
}

const ProductCostHistorySchema = new Schema<IProductCostHistoryDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    canonicalVariantId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: true,
      index: true,
    },
    costPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    effectiveTo: {
      type: Date,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ProductCostHistorySchema.index({ organizationId: 1, canonicalVariantId: 1, effectiveFrom: -1 });

export const ProductCostHistory = mongoose.model<IProductCostHistoryDocument>(
  'ProductCostHistory',
  ProductCostHistorySchema
);
