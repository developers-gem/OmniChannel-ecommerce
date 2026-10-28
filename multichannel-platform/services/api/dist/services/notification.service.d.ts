import mongoose from 'mongoose';
import { INotificationDocument } from '../database/models';
import { NotificationSeverity, NotificationCategory, ChannelType } from '@multichannel/shared';
export interface CreateNotificationDTO {
    organizationId?: mongoose.Types.ObjectId | string;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    category?: NotificationCategory;
    channelType?: ChannelType;
    link?: string;
}
export declare class NotificationService {
    static create(dto: CreateNotificationDTO): Promise<INotificationDocument | null>;
    /**
     * Notification when product(s) are uploaded/pushed to Shopify or eBay
     */
    static notifyProductUploaded(params: {
        organizationId?: mongoose.Types.ObjectId | string;
        productTitle: string;
        channelName: string;
        channelType: ChannelType;
        sku?: string;
        count?: number;
    }): Promise<INotificationDocument | null>;
    /**
     * Notification when products are imported/fetched from Shopify or eBay
     */
    static notifyProductImported(params: {
        organizationId?: mongoose.Types.ObjectId | string;
        channelName: string;
        channelType: ChannelType;
        count: number;
        sampleTitle?: string;
    }): Promise<INotificationDocument | null>;
    /**
     * Notification when product or details are updated/modified
     */
    static notifyProductModified(params: {
        organizationId?: mongoose.Types.ObjectId | string;
        productTitle: string;
        source: string;
        channelType?: ChannelType;
        changesSummary?: string;
        link?: string;
    }): Promise<INotificationDocument | null>;
}
//# sourceMappingURL=notification.service.d.ts.map