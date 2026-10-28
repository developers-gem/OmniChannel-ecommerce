import mongoose, { Document } from 'mongoose';
import { InventoryChangeType } from '@multichannel/shared';
export interface IInventoryMovementDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    canonicalVariantId: mongoose.Types.ObjectId;
    changeType: InventoryChangeType;
    quantityChanged: number;
    previousTrackedStock: number;
    newTrackedStock: number;
    reason: string;
    referenceId?: string;
    performedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
}
export declare const InventoryMovement: mongoose.Model<IInventoryMovementDocument, {}, {}, {}, mongoose.Document<unknown, {}, IInventoryMovementDocument, {}, {}> & IInventoryMovementDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=InventoryMovement.d.ts.map