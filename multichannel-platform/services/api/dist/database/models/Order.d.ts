import mongoose, { Document } from 'mongoose';
import { ChannelType, OrderFinancialStatus, OrderFulfillmentStatus } from '@multichannel/shared';
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
export declare const Order: mongoose.Model<IOrderDocument, {}, {}, {}, mongoose.Document<unknown, {}, IOrderDocument, {}, {}> & IOrderDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Order.d.ts.map