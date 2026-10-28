import mongoose, { Document } from 'mongoose';
export interface IProductCostHistoryDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    canonicalVariantId: mongoose.Types.ObjectId;
    costPrice: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
    reason?: string;
    createdAt: Date;
}
export declare const ProductCostHistory: mongoose.Model<IProductCostHistoryDocument, {}, {}, {}, mongoose.Document<unknown, {}, IProductCostHistoryDocument, {}, {}> & IProductCostHistoryDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=ProductCostHistory.d.ts.map