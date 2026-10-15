import mongoose, { Schema, Document } from 'mongoose';
import { CsvJobStatus } from '@multichannel/shared';

export interface ICsvImportJobDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  fileName: string;
  fileSize: number;
  status: CsvJobStatus;
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  mappingConfig: Record<string, string>;
  destinationChannels: string[];
  rowErrors: {
    row: number;
    sku?: string;
    error: string;
  }[];
  createdAt: Date;
  completedAt?: Date;
}

const CsvImportJobSchema = new Schema<ICsvImportJobDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(CsvJobStatus),
      default: CsvJobStatus.PENDING,
      index: true,
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    processedRows: {
      type: Number,
      default: 0,
    },
    successfulRows: {
      type: Number,
      default: 0,
    },
    failedRows: {
      type: Number,
      default: 0,
    },
    mappingConfig: {
      type: Schema.Types.Mixed,
      default: {},
    },
    destinationChannels: {
      type: [String],
      default: [],
    },
    rowErrors: [
      {
        row: Number,
        sku: String,
        error: String,
      },
    ],
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

CsvImportJobSchema.index({ organizationId: 1, createdAt: -1 });

export const CsvImportJob = mongoose.model<ICsvImportJobDocument>(
  'CsvImportJob',
  CsvImportJobSchema
);
