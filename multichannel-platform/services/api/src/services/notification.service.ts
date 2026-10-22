import mongoose from 'mongoose';
import { Notification, INotificationDocument } from '../database/models';
import { NotificationSeverity, NotificationCategory, ChannelType } from '@multichannel/shared';
import { logger } from '../utils/logger';

export interface CreateNotificationDTO {
  organizationId?: mongoose.Types.ObjectId | string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  category?: NotificationCategory;
  channelType?: ChannelType;
  link?: string;
}

export class NotificationService {
  static async create(dto: CreateNotificationDTO): Promise<INotificationDocument | null> {
    try {
      if (!dto.organizationId) {
        logger.warn(`Skipping notification "${dto.title}": organizationId is missing.`);
        return null;
      }

      const doc = await Notification.create({
        organizationId: dto.organizationId,
        title: dto.title,
        message: dto.message,
        severity: dto.severity || NotificationSeverity.INFO,
        category: dto.category || NotificationCategory.INTEGRATION,
        channelType: dto.channelType,
        link: dto.link,
        isRead: false,
      });

      logger.info(
        `[Notification] ${dto.severity || 'INFO'}: "${dto.title}" created for organization ${dto.organizationId}`
      );
      return doc;
    } catch (err: any) {
      logger.error('Failed to create notification:', err);
      return null;
    }
  }

  /**
   * Notification when product(s) are uploaded/pushed to Shopify or eBay
   */
  static async notifyProductUploaded(params: {
    organizationId?: mongoose.Types.ObjectId | string;
    productTitle: string;
    channelName: string;
    channelType: ChannelType;
    sku?: string;
    count?: number;
  }) {
    const isBulk = Boolean(params.count && params.count > 1);
    const title = isBulk
      ? `${params.count} Products Uploaded to ${params.channelName}`
      : `Product Uploaded to ${params.channelName}`;

    const message = isBulk
      ? `Successfully uploaded and published ${params.count} products to ${params.channelName} (${params.channelType}).`
      : `Product "${params.productTitle}"${params.sku ? ` (SKU: ${params.sku})` : ''} was uploaded and published to ${params.channelName} (${params.channelType}).`;

    return this.create({
      organizationId: params.organizationId,
      title,
      message,
      severity: NotificationSeverity.SUCCESS,
      category: NotificationCategory.INTEGRATION,
      channelType: params.channelType,
      link: '/mappings',
    });
  }

  /**
   * Notification when products are imported/fetched from Shopify or eBay
   */
  static async notifyProductImported(params: {
    organizationId?: mongoose.Types.ObjectId | string;
    channelName: string;
    channelType: ChannelType;
    count: number;
    sampleTitle?: string;
  }) {
    const title = `Products Imported from ${params.channelName}`;
    const message = `Successfully imported ${params.count} product listings from ${params.channelName} (${params.channelType})${params.sampleTitle ? ` including "${params.sampleTitle}"` : ''}.`;

    return this.create({
      organizationId: params.organizationId,
      title,
      message,
      severity: NotificationSeverity.SUCCESS,
      category: NotificationCategory.SYNC,
      channelType: params.channelType,
      link: '/mappings',
    });
  }

  /**
   * Notification when product or details are updated/modified
   */
  static async notifyProductModified(params: {
    organizationId?: mongoose.Types.ObjectId | string;
    productTitle: string;
    source: string;
    channelType?: ChannelType;
    changesSummary?: string;
    link?: string;
  }) {
    const title = `Product Modified: ${params.productTitle}`;
    const message = `"${params.productTitle}" was updated via ${params.source}.${params.changesSummary ? ` ${params.changesSummary}` : ''}`;

    return this.create({
      organizationId: params.organizationId,
      title,
      message,
      severity: NotificationSeverity.INFO,
      category: params.channelType ? NotificationCategory.INTEGRATION : NotificationCategory.SYSTEM,
      channelType: params.channelType,
      link: params.link || '/products',
    });
  }
}
