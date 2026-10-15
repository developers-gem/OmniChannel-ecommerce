import mongoose, { Schema, Document } from 'mongoose';
import {
  ChannelType,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '@multichannel/shared';

export interface IOrderDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  channelConnectionId: mongoose.Types.ObjectId;
  channelType: ChannelType;
  externalOrderId: string;
  orderNumber: string;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
  };
  shippingAddress: Record<string, any>;
  financialStatus: OrderFinancialStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  currency: string;
  subtotalPrice: number;
  totalDiscount: number;
  totalShipping: number;
  totalTax: number;
  totalPrice: number;
  channelFee: number;
  placedAt: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrderDocument>(
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
    externalOrderId: {
      type: String,
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customer: {
      name: { type: String, default: 'Guest' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    shippingAddress: {
      type: Schema.Types.Mixed,
      default: {},
    },
    financialStatus: {
      type: String,
      enum: Object.values(OrderFinancialStatus),
      default: OrderFinancialStatus.PAID,
      index: true,
    },
    fulfillmentStatus: {
      type: String,
      enum: Object.values(OrderFulfillmentStatus),
      default: OrderFulfillmentStatus.UNFULFILLED,
      index: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    subtotalPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
    },
    totalShipping: {
      type: Number,
      default: 0,
    },
    totalTax: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    channelFee: {
      type: Number,
      default: 0,
    },
    placedAt: {
      type: Date,
      required: true,
      index: true,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.index(
  {
    organizationId: 1,
    channelConnectionId: 1,
    externalOrderId: 1,
  },
  { unique: true }
);

OrderSchema.index({ organizationId: 1, placedAt: -1 });

export const Order = mongoose.model<IOrderDocument>('Order', OrderSchema);
