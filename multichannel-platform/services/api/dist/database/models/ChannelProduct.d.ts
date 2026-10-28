import mongoose, { Document } from 'mongoose';
import { ChannelType, ChannelProductStatus, SyncStatus } from '@multichannel/shared';
export interface IChannelProductDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    channelConnectionId: mongoose.Types.ObjectId;
    channelType: ChannelType;
    externalProductId: string;
    externalVariantId?: string;
    externalListingId?: string;
    title: string;
    sku?: string;
    barcode?: string;
    price: number;
    inventoryQuantity: number;
    status: ChannelProductStatus;
    syncStatus: SyncStatus;
    lastSyncedAt?: Date;
    rawPayload: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ChannelProduct: mongoose.Model<IChannelProductDocument, {}, {}, {}, mongoose.Document<unknown, {}, IChannelProductDocument, {}, {}> & IChannelProductDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=ChannelProduct.d.ts.map