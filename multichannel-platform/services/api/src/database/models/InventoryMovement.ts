import mongoose, { Schema, Document } from 'mongoose';
import { InventoryChangeType } from '@multichannel/shared';

export interface IInventoryMovementDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  canonicalVariantId: mongoose.Types.ObjectId;
  changeType: InventoryChangeType;
  quantityChanged: number;
  previousTrackedStock: number;
  newTrackedStock: number;
  reason: string;
  referenceId?: string;
  performedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const InventoryMovementSchema = new Schema<IInventoryMovementDocument>(
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
    changeType: {
      type: String,
      enum: Object.values(InventoryChangeType),
      required: true,
      index: true,
    },
    quantityChanged: {
      type: Number,
      required: true,
    },
    previousTrackedStock: {
      type: Number,
      required: true,
    },
    newTrackedStock: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    referenceId: {
      type: String,
      trim: true,
      index: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

InventoryMovementSchema.index({ organizationId: 1, canonicalVariantId: 1, createdAt: -1 });

export const InventoryMovement = mongoose.model<IInventoryMovementDocument>(
  'InventoryMovement',
  InventoryMovementSchema
);
