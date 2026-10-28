import mongoose, { Document } from 'mongoose';
export interface IProductVariantDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    canonicalProductId: mongoose.Types.ObjectId;
    sku: string;
    barcode?: string;
    title: string;
    options: {
        name: string;
        value: string;
    }[];
    costPrice: number;
    retailPrice: number;
    compareAtPrice?: number;
    weight?: number;
    weightUnit?: string;
    shippingCharge?: number;
    isDataChanged?: boolean;
    lastSyncedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ProductVariant: mongoose.Model<IProductVariantDocument, {}, {}, {}, mongoose.Document<unknown, {}, IProductVariantDocument, {}, {}> & IProductVariantDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=ProductVariant.d.ts.map