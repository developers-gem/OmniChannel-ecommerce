import mongoose, { Document } from 'mongoose';
import { ChannelType, MappingConfidence, MappingStatus } from '@multichannel/shared';
export interface IProductMappingDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    canonicalProductId: mongoose.Types.ObjectId;
    canonicalVariantId: mongoose.Types.ObjectId;
    channelConnectionId: mongoose.Types.ObjectId;
    channelProductId: mongoose.Types.ObjectId;
    channelType: ChannelType;
    mappingConfidence: MappingConfidence;
    syncPrice: boolean;
    syncInventory: boolean;
    priceModifier?: {
        type: 'FIXED' | 'PERCENTAGE';
        value: number;
    };
    status: MappingStatus;
    unmappedAt?: Date;
    unmappedReason?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ProductMapping: mongoose.Model<IProductMappingDocument, {}, {}, {}, mongoose.Document<unknown, {}, IProductMappingDocument, {}, {}> & IProductMappingDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=ProductMapping.d.ts.map