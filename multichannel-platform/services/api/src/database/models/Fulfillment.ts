import mongoose, { Schema, Document } from 'mongoose';

export interface IFulfillmentDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  trackingCompany?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILURE';
  externalFulfillmentId?: string;
  lineItemIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const FulfillmentSchema = new Schema<IFulfillmentDocument>(
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
      required: true,
      index: true,
    },
    trackingCompany: {
      type: String,
      trim: true,
    },
    trackingNumber: {
      type: String,
      trim: true,
    },
    trackingUrl: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILURE'],
      default: 'PENDING',
    },
    externalFulfillmentId: {
      type: String,
    },
    lineItemIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'OrderLine',
      },
    ],
  },
  {
    timestamps: true,
  }
);

FulfillmentSchema.index({ organizationId: 1, orderId: 1 });

export const Fulfillment = mongoose.model<IFulfillmentDocument>('Fulfillment', FulfillmentSchema);
