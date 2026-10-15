import mongoose, { Schema, Document } from 'mongoose';
import { SyncJobType, SyncJobStatus } from '@multichannel/shared';

export interface ISyncJobDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  channelConnectionId?: mongoose.Types.ObjectId;
  jobType: SyncJobType;
  status: SyncJobStatus;
  bullJobId?: string;
  details?: Record<string, any>;
  errorMessage?: string;
  attemptCount: number;
  createdAt: Date;
  finishedAt?: Date;
}

const SyncJobSchema = new Schema<ISyncJobDocument>(
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
      index: true,
    },
    jobType: {
      type: String,
      enum: Object.values(SyncJobType),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SyncJobStatus),
      default: SyncJobStatus.QUEUED,
      index: true,
    },
    bullJobId: {
      type: String,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    errorMessage: {
      type: String,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    finishedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

SyncJobSchema.index({ organizationId: 1, createdAt: -1 });

export const SyncJob = mongoose.model<ISyncJobDocument>('SyncJob', SyncJobSchema);
