import mongoose, { Schema, Document } from 'mongoose';
import { ChannelType, MappingConfidence, MappingStatus } from '@multichannel/shared';

export interface IProductMappingDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  canonicalProductId: mongoose.Types.ObjectId;
  canonicalVariantId: mongoose.Types.ObjectId;
  channelConnectionId: mongoose.Types.ObjectId;
  channelProductId: mongoose.Types.ObjectId;
  channelType: ChannelType;
  mappingConfidence: MappingConfidence;
  syncPrice: boolean;
  syncInventory: boolean;
  priceModifier?: {
    type: 'FIXED' | 'PERCENTAGE';
    value: number;
  };
  status: MappingStatus;
  createdAt: Date;
  updatedAt: Date;
}

const ProductMappingSchema = new Schema<IProductMappingDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    canonicalProductId: {
      type: Schema.Types.ObjectId,
      ref: 'CanonicalProduct',
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
    channelProductId: {
      type: Schema.Types.ObjectId,
      ref: 'ChannelProduct',
      required: true,
      index: true,
    },
    channelType: {
      type: String,
      enum: Object.values(ChannelType),
      required: true,
      index: true,
    },
    mappingConfidence: {
      type: String,
      enum: Object.values(MappingConfidence),
      default: MappingConfidence.EXACT_SKU,
    },
    syncPrice: {
      type: Boolean,
      default: true,
    },
    syncInventory: {
      type: Boolean,
      default: true,
    },
    priceModifier: {
      type: {
        type: String,
        enum: ['FIXED', 'PERCENTAGE'],
      },
      value: {
        type: Number,
      },
    },
    status: {
      type: String,
      enum: Object.values(MappingStatus),
      default: MappingStatus.MAPPED,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ProductMappingSchema.index(
  {
    organizationId: 1,
    channelProductId: 1,
  },
  { unique: true }
);

ProductMappingSchema.index({ organizationId: 1, canonicalVariantId: 1 });

export const ProductMapping = mongoose.model<IProductMappingDocument>(
  'ProductMapping',
  ProductMappingSchema
);
