import mongoose, { Schema, Document } from 'mongoose';
import { ChannelType, ChannelStatus } from '@multichannel/shared';

export interface IChannelConnectionDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  channelType: ChannelType;
  name: string;
  status: ChannelStatus;
  credentials: Record<string, any>;
  config: Record<string, any>;
  syncSettings: {
    autoSyncInventory: boolean;
    autoSyncPrices: boolean;
    autoImportOrders: boolean;
    syncIntervalMinutes: number;
  };
  lastSyncAt?: Date;
  lastError?: {
    message: string;
    code?: string;
    timestamp: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChannelConnectionSchema = new Schema<IChannelConnectionDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    channelType: {
      type: String,
      enum: Object.values(ChannelType),
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(ChannelStatus),
      default: ChannelStatus.INITIALIZING,
      index: true,
    },
    credentials: {
      type: Schema.Types.Mixed,
      default: {},
    },
    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
    syncSettings: {
      autoSyncInventory: { type: Boolean, default: true },
      autoSyncPrices: { type: Boolean, default: true },
      autoImportOrders: { type: Boolean, default: true },
      syncIntervalMinutes: { type: Number, default: 15 },
    },
    lastSyncAt: {
      type: Date,
    },
    lastError: {
      message: String,
      code: String,
      timestamp: Date,
    },
  },
  {
    timestamps: true,
  }
);

ChannelConnectionSchema.index({ organizationId: 1, channelType: 1 });

export const ChannelConnection = mongoose.model<IChannelConnectionDocument>(
  'ChannelConnection',
  ChannelConnectionSchema
);
