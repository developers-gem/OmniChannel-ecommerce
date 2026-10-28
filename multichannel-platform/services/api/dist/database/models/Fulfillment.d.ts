import mongoose, { Document } from 'mongoose';
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
export declare const Fulfillment: mongoose.Model<IFulfillmentDocument, {}, {}, {}, mongoose.Document<unknown, {}, IFulfillmentDocument, {}, {}> & IFulfillmentDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Fulfillment.d.ts.map