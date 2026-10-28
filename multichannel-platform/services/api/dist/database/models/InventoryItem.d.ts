import mongoose, { Document } from 'mongoose';
export interface IInventoryItemDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    canonicalVariantId: mongoose.Types.ObjectId;
    sku: string;
    trackedStock: number;
    reservedStock: number;
    safetyStock: number;
    availableToAllocate: number;
    lowStockThreshold: number;
    location: string;
    version: number;
    shippingCharge?: number;
    isDataChanged?: boolean;
    lastSyncedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const InventoryItem: mongoose.Model<IInventoryItemDocument, {}, {}, {}, mongoose.Document<unknown, {}, IInventoryItemDocument, {}, {}> & IInventoryItemDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=InventoryItem.d.ts.map