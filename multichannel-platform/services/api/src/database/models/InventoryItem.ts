import mongoose, { Schema, Document } from 'mongoose';

export interface IInventoryItemDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  canonicalVariantId: mongoose.Types.ObjectId;
  sku: string;
  trackedStock: number;
  reservedStock: number;
  safetyStock: number;
  availableToAllocate: number;
  lowStockThreshold: number;
  location: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItemDocument>(
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
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    trackedStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    reservedStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    safetyStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableToAllocate: {
      type: Number,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
    },
    location: {
      type: String,
      default: 'Default Warehouse',
    },
    version: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

InventoryItemSchema.index({ organizationId: 1, canonicalVariantId: 1 }, { unique: true });
InventoryItemSchema.index({ organizationId: 1, sku: 1 });

// Automatically compute availableToAllocate before save
InventoryItemSchema.pre('save', function (next) {
  this.availableToAllocate = Math.max(0, this.trackedStock - this.reservedStock - this.safetyStock);
  next();
});

export const InventoryItem = mongoose.model<IInventoryItemDocument>(
  'InventoryItem',
  InventoryItemSchema
);
