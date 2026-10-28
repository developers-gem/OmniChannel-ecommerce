import mongoose, { Document } from 'mongoose';
import { AllocationType } from '@multichannel/shared';
export interface IInventoryAllocationDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    canonicalVariantId: mongoose.Types.ObjectId;
    channelConnectionId: mongoose.Types.ObjectId;
    allocationType: AllocationType;
    allocationValue: number;
    channelPushedQuantity: number;
    lastPushedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const InventoryAllocation: mongoose.Model<IInventoryAllocationDocument, {}, {}, {}, mongoose.Document<unknown, {}, IInventoryAllocationDocument, {}, {}> & IInventoryAllocationDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=InventoryAllocation.d.ts.map