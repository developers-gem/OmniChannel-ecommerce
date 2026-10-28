import mongoose, { Document } from 'mongoose';
import { ChannelType, ChannelStatus } from '@multichannel/shared';
export interface IChannelConnectionDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    channelType: ChannelType;
    name: string;
    status: ChannelStatus;
    credentials: Record<string, any>;
    config: Record<string, any>;
    syncSettings: {
        autoSyncInventory: boolean;
        autoSyncPrices: boolean;
        autoImportOrders: boolean;
        syncIntervalMinutes: number;
    };
    lastSyncAt?: Date;
    lastError?: {
        message: string;
        code?: string;
        timestamp: Date;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ChannelConnection: mongoose.Model<IChannelConnectionDocument, {}, {}, {}, mongoose.Document<unknown, {}, IChannelConnectionDocument, {}, {}> & IChannelConnectionDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=ChannelConnection.d.ts.map