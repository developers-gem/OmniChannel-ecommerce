"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const models_1 = require("../database/models");
const shared_1 = require("@multichannel/shared");
const logger_1 = require("../utils/logger");
class NotificationService {
    static async create(dto) {
        try {
            if (!dto.organizationId) {
                logger_1.logger.warn(`Skipping notification "${dto.title}": organizationId is missing.`);
                return null;
            }
            const doc = await models_1.Notification.create({
                organizationId: dto.organizationId,
                title: dto.title,
                message: dto.message,
                severity: dto.severity || shared_1.NotificationSeverity.INFO,
                category: dto.category || shared_1.NotificationCategory.INTEGRATION,
                channelType: dto.channelType,
                link: dto.link,
                isRead: false,
            });
            logger_1.logger.info(`[Notification] ${dto.severity || 'INFO'}: "${dto.title}" created for organization ${dto.organizationId}`);
            return doc;
        }
        catch (err) {
            logger_1.logger.error('Failed to create notification:', err);
            return null;
        }
    }
    /**
     * Notification when product(s) are uploaded/pushed to Shopify or eBay
     */
    static async notifyProductUploaded(params) {
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
            severity: shared_1.NotificationSeverity.SUCCESS,
            category: shared_1.NotificationCategory.INTEGRATION,
            channelType: params.channelType,
            link: '/mappings',
        });
    }
    /**
     * Notification when products are imported/fetched from Shopify or eBay
     */
    static async notifyProductImported(params) {
        const title = `Products Imported from ${params.channelName}`;
        const message = `Successfully imported ${params.count} product listings from ${params.channelName} (${params.channelType})${params.sampleTitle ? ` including "${params.sampleTitle}"` : ''}.`;
        return this.create({
            organizationId: params.organizationId,
            title,
            message,
            severity: shared_1.NotificationSeverity.SUCCESS,
            category: shared_1.NotificationCategory.SYNC,
            channelType: params.channelType,
            link: '/mappings',
        });
    }
    /**
     * Notification when product or details are updated/modified
     */
    static async notifyProductModified(params) {
        const title = `Product Modified: ${params.productTitle}`;
        const message = `"${params.productTitle}" was updated via ${params.source}.${params.changesSummary ? ` ${params.changesSummary}` : ''}`;
        return this.create({
            organizationId: params.organizationId,
            title,
            message,
            severity: shared_1.NotificationSeverity.INFO,
            category: params.channelType ? shared_1.NotificationCategory.INTEGRATION : shared_1.NotificationCategory.SYSTEM,
            channelType: params.channelType,
            link: params.link || '/products',
        });
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notification.service.js.map