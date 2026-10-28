import mongoose, { Document } from 'mongoose';
export interface IOrderLineDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    orderId: mongoose.Types.ObjectId;
    canonicalProductId?: mongoose.Types.ObjectId;
    canonicalVariantId?: mongoose.Types.ObjectId;
    sku: string;
    title: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    totalDiscount: number;
    taxAmount: number;
    externalLineId?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const OrderLine: mongoose.Model<IOrderLineDocument, {}, {}, {}, mongoose.Document<unknown, {}, IOrderLineDocument, {}, {}> & IOrderLineDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=OrderLine.d.ts.map