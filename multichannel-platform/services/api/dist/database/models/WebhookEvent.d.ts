import mongoose, { Document } from 'mongoose';
import { ChannelType } from '@multichannel/shared';
export interface IWebhookEventDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    channelConnectionId: mongoose.Types.ObjectId;
    channelType: ChannelType;
    topic: string;
    eventId: string;
    status: 'RECEIVED' | 'PROCESSED' | 'IGNORED_DUPLICATE' | 'FAILED';
    payload: Record<string, any>;
    processedAt?: Date;
    errorMessage?: string;
    createdAt: Date;
}
export declare const WebhookEvent: mongoose.Model<IWebhookEventDocument, {}, {}, {}, mongoose.Document<unknown, {}, IWebhookEventDocument, {}, {}> & IWebhookEventDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=WebhookEvent.d.ts.map