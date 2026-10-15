import mongoose, { Schema, Document } from 'mongoose';
import { AllocationType } from '@multichannel/shared';

export interface IInventoryAllocationDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  canonicalVariantId: mongoose.Types.ObjectId;
  channelConnectionId: mongoose.Types.ObjectId;
  allocationType: AllocationType;
  allocationValue: number;
  channelPushedQuantity: number;
  lastPushedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryAllocationSchema = new Schema<IInventoryAllocationDocument>(
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
    channelConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChannelConnection',
      required: true,
      index: true,
    },
    allocationType: {
      type: String,
      enum: Object.values(AllocationType),
      default: AllocationType.SHARED_POOL,
    },
    allocationValue: {
      type: Number,
      default: 100, // For percentage or fixed quantity
    },
    channelPushedQuantity: {
      type: Number,
      default: 0,
    },
    lastPushedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

InventoryAllocationSchema.index(
  {
    organizationId: 1,
    canonicalVariantId: 1,
    channelConnectionId: 1,
  },
  { unique: true }
);

export const InventoryAllocation = mongoose.model<IInventoryAllocationDocument>(
  'InventoryAllocation',
  InventoryAllocationSchema
);
