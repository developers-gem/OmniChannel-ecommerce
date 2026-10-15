import mongoose, { Schema, Document } from 'mongoose';
import { TransactionType } from '@multichannel/shared';

export interface IFinancialTransactionDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  channelConnectionId?: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: number;
  currency: string;
  date: Date;
  notes?: string;
  createdAt: Date;
}

const FinancialTransactionSchema = new Schema<IFinancialTransactionDocument>(
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
      index: true,
    },
    channelConnectionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChannelConnection',
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

FinancialTransactionSchema.index({ organizationId: 1, date: -1 });

export const FinancialTransaction = mongoose.model<IFinancialTransactionDocument>(
  'FinancialTransaction',
  FinancialTransactionSchema
);
