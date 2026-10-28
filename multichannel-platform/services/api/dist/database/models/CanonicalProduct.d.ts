import mongoose, { Document } from 'mongoose';
import { ProductStatus } from '@multichannel/shared';
export interface ICanonicalProductDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    title: string;
    masterSku: string;
    description?: string;
    brand?: string;
    category?: string;
    tags: string[];
    images: {
        url: string;
        altText?: string;
        position?: number;
        isPrimary?: boolean;
    }[];
    status: ProductStatus;
    defaultCostPrice: number;
    defaultRetailPrice: number;
    shippingCharge?: number;
    totalVariants: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const CanonicalProduct: mongoose.Model<ICanonicalProductDocument, {}, {}, {}, mongoose.Document<unknown, {}, ICanonicalProductDocument, {}, {}> & ICanonicalProductDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=CanonicalProduct.d.ts.map