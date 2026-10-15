import mongoose, { Schema, Document } from 'mongoose';
import { ChannelType, ChannelProductStatus, SyncStatus } from '@multichannel/shared';

export interface IChannelProductDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  channelConnectionId: mongoose.Types.ObjectId;
  channelType: ChannelType;
  externalProductId: string;
  externalVariantId?: string;
  externalListingId?: string;
  title: string;
  sku?: string;
  barcode?: string;
  price: number;
  inventoryQuantity: number;
  status: ChannelProductStatus;
  syncStatus: SyncStatus;
  lastSyncedAt?: Date;
  rawPayload: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelProductSchema = new Schema<IChannelProductDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    channelConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChannelConnection',
      required: true,
      index: true,
    },
    channelType: {
      type: String,
      enum: Object.values(ChannelType),
      required: true,
      index: true,
    },
    externalProductId: {
      type: String,
      required: true,
      index: true,
    },
    externalVariantId: {
      type: String,
      default: '',
      index: true,
    },
    externalListingId: {
      type: String,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      index: true,
    },
    barcode: {
      type: String,
      trim: true,
      index: true,
    },
    price: {
      type: Number,
      default: 0,
    },
    inventoryQuantity: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(ChannelProductStatus),
      default: ChannelProductStatus.ACTIVE,
      index: true,
    },
    syncStatus: {
      type: String,
      enum: Object.values(SyncStatus),
      default: SyncStatus.SYNCED,
      index: true,
    },
    lastSyncedAt: {
      type: Date,
    },
    rawPayload: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

ChannelProductSchema.index(
  {
    organizationId: 1,
    channelConnectionId: 1,
    externalProductId: 1,
    externalVariantId: 1,
  },
  { unique: true }
);

export const ChannelProduct = mongoose.model<IChannelProductDocument>(
  'ChannelProduct',
  ChannelProductSchema
);
