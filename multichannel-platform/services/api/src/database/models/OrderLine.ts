import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderLineDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  canonicalProductId?: mongoose.Types.ObjectId;
  canonicalVariantId?: mongoose.Types.ObjectId;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  unitCost: number; // Frozen historical cost at the time the order was placed
  totalDiscount: number;
  taxAmount: number;
  externalLineId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderLineSchema = new Schema<IOrderLineDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    canonicalProductId: {
      type: Schema.Types.ObjectId,
      ref: 'CanonicalProduct',
      index: true,
    },
    canonicalVariantId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductVariant',
      index: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    unitCost: {
      type: Number,
      required: true,
      default: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    externalLineId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

OrderLineSchema.index({ organizationId: 1, orderId: 1 });
OrderLineSchema.index({ organizationId: 1, canonicalVariantId: 1 });

export const OrderLine = mongoose.model<IOrderLineDocument>('OrderLine', OrderLineSchema);
