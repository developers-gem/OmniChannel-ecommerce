import mongoose, { Schema, Document } from 'mongoose';
import { ChannelType } from '@multichannel/shared';

export interface IWebhookEventDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  channelConnectionId: mongoose.Types.ObjectId;
  channelType: ChannelType;
  topic: string;
  eventId: string;
  status: 'RECEIVED' | 'PROCESSED' | 'IGNORED_DUPLICATE' | 'FAILED';
  payload: Record<string, any>;
  processedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEventDocument>(
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
    topic: {
      type: String,
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSED', 'IGNORED_DUPLICATE', 'FAILED'],
      default: 'RECEIVED',
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    processedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

WebhookEventSchema.index(
  {
    organizationId: 1,
    channelType: 1,
    eventId: 1,
  },
  { unique: true }
);

export const WebhookEvent = mongoose.model<IWebhookEventDocument>(
  'WebhookEvent',
  WebhookEventSchema
);
