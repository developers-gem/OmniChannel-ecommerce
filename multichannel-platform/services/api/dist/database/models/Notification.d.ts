import mongoose, { Document } from 'mongoose';
import { NotificationSeverity, NotificationCategory, ChannelType } from '@multichannel/shared';
export interface INotificationDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    title: string;
    message: string;
    severity: NotificationSeverity;
    category: NotificationCategory;
    channelType?: ChannelType;
    isRead: boolean;
    link?: string;
    createdAt: Date;
}
export declare const Notification: mongoose.Model<INotificationDocument, {}, {}, {}, mongoose.Document<unknown, {}, INotificationDocument, {}, {}> & INotificationDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Notification.d.ts.map