import { Request, Response } from 'express';
import crypto from 'crypto';
import {
  ChannelConnection,
  WebhookEvent,
  Order,
  OrderLine,
  InventoryItem,
  InventoryMovement,
  ChannelProduct,
  ProductMapping,
  ProductVariant,
} from '../../database/models';
import {
  ChannelType,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
  InventoryChangeType,
  ChannelProductStatus,
  SyncStatus,
  NotificationSeverity,
  NotificationCategory,
} from '@multichannel/shared';
import { decryptSecret } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { NotificationService } from '../../services/notification.service';
import { ShopifyService } from '../../services/shopify.service';

export class WebhooksController {
  /**
   * POST /api/v1/webhooks/shopify/:connectionId
   * Handles Shopify webhook notifications (orders/create, inventory_levels/update, products/update)
   */
  static async handleShopify(req: any, res: Response) {
    try {
      const { connectionId } = req.params;
      const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const eventId = (req.headers['x-shopify-webhook-id'] as string) || req.body?.id?.toString() || `sh_${Date.now()}`;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;

      const connection = await ChannelConnection.findById(connectionId);
      if (!connection || connection.channelType !== ChannelType.SHOPIFY) {
        return res.status(404).json({ success: false, error: 'Shopify channel connection not found' });
      }

      // Verify HMAC if shared secret exists
      const webhookSecretEnc = connection.credentials?.webhookSecret || connection.credentials?.apiSecret;
      if (webhookSecretEnc && hmacHeader) {
        const secret = decryptSecret(webhookSecretEnc);
        const generatedHash = crypto
          .createHmac('sha256', secret)
          .update(req.rawBody || JSON.stringify(req.body))
          .digest('base64');

        if (generatedHash !== hmacHeader) {
          logger.warn(`Shopify webhook HMAC mismatch for connection ${connectionId}`);
          return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
        }
      }

      // Idempotency: Deduplicate event
      const existing = await WebhookEvent.findOne({
        organizationId: connection.organizationId,
        channelType: ChannelType.SHOPIFY,
        eventId,
      });

      if (existing) {
        return res.status(200).json({ status: 'ignored_duplicate', eventId });
      }

      // Persist event
      const eventDoc = await WebhookEvent.create({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        channelType: ChannelType.SHOPIFY,
        topic: topic || 'shopify/generic',
        eventId,
        status: 'RECEIVED',
        payload: req.body,
      });

      // Handle specific topics
      if (topic === 'orders/create' || topic === 'orders/paid') {
        await WebhooksController.processShopifyOrder(connection, req.body);
      } else if (topic === 'inventory_levels/update') {
        await WebhooksController.processShopifyInventoryUpdate(connection, req.body);
      } else if (topic === 'products/update') {
        await WebhooksController.processShopifyProductUpdate(connection, req.body);
      } else if (topic === 'products/create') {
        await WebhooksController.processShopifyProductCreate(connection, req.body);
      }

      eventDoc.status = 'PROCESSED';
      eventDoc.processedAt = new Date();
      await eventDoc.save();

      return res.status(200).json({ status: 'processed', eventId });
    } catch (err: any) {
      logger.error('Shopify webhook processing error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/webhooks/ebay/:connectionId
   * Handles eBay marketplace notifications
   */
  static async handleEbay(req: any, res: Response) {
    try {
      const { connectionId } = req.params;
      const eventId = req.headers['x-ebay-notification-id'] as string || req.body?.metadata?.topic || `ebay_${Date.now()}`;
      const topic = req.body?.metadata?.topic || req.headers['x-ebay-topic'] as string || 'ebay/notification';

      const connection = await ChannelConnection.findById(connectionId);
      if (!connection || connection.channelType !== ChannelType.EBAY) {
        return res.status(404).json({ success: false, error: 'eBay channel connection not found' });
      }

      // Deduplicate event
      const existing = await WebhookEvent.findOne({
        organizationId: connection.organizationId,
        channelType: ChannelType.EBAY,
        eventId,
      });

      if (existing) {
        return res.status(200).json({ status: 'ignored_duplicate', eventId });
      }

      const eventDoc = await WebhookEvent.create({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        channelType: ChannelType.EBAY,
        topic,
        eventId,
        status: 'PROCESSED',
        payload: req.body,
        processedAt: new Date(),
      });

      // Dispatch notification for eBay events
      try {
        const upperTopic = (topic || '').toUpperCase();
        let notifTitle = 'eBay Notification';
        let notifMsg = `Received notification "${topic}" from eBay (${connection.name || 'Store'}).`;
        let notifSeverity = NotificationSeverity.INFO;

        if (upperTopic.includes('ITEM_CREATED') || upperTopic.includes('LISTING_CREATED') || upperTopic.includes('CREATE')) {
          notifTitle = 'Product Uploaded on eBay';
          notifMsg = `A new product or listing was uploaded to eBay (${connection.name || 'Store'}).`;
          notifSeverity = NotificationSeverity.SUCCESS;
        } else if (upperTopic.includes('REVISED') || upperTopic.includes('UPDATE') || upperTopic.includes('MODIFIED')) {
          notifTitle = 'Product Modified on eBay';
          notifMsg = `A product or listing was updated/modified on eBay (${connection.name || 'Store'}).`;
        }

        await NotificationService.create({
          organizationId: connection.organizationId,
          title: notifTitle,
          message: notifMsg,
          severity: notifSeverity,
          category: NotificationCategory.INTEGRATION,
          channelType: ChannelType.EBAY,
          link: '/mappings',
        });
      } catch (notifErr: any) {
        logger.warn(`Could not dispatch eBay notification: ${notifErr.message}`);
      }

      return res.status(200).json({ status: 'processed', eventId });
    } catch (err: any) {
      logger.error('eBay webhook processing error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/webhooks/custom/:connectionId
   * Handles custom webstore webhook notifications with HMAC-SHA256
   */
  static async handleCustom(req: any, res: Response) {
    try {
      const { connectionId } = req.params;
      const signatureHeader = req.headers['x-webhook-signature'] as string;
      const topic = req.headers['x-webhook-topic'] as string || 'custom/event';
      const eventId = req.headers['x-webhook-id'] as string || req.body?.id?.toString() || `custom_${Date.now()}`;

      const connection = await ChannelConnection.findById(connectionId);
      if (!connection || connection.channelType !== ChannelType.CUSTOM_STORE) {
        return res.status(404).json({ success: false, error: 'Custom store connection not found' });
      }

      // Verify signature if secret configured
      const secretEnc = connection.credentials?.webhookSecret || connection.credentials?.apiKey;
      if (secretEnc && signatureHeader) {
        const secret = decryptSecret(secretEnc);
        const computed = crypto
          .createHmac('sha256', secret)
          .update(req.rawBody || JSON.stringify(req.body))
          .digest('hex');

        if (computed !== signatureHeader) {
          return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
        }
      }

      // Deduplicate event
      const existing = await WebhookEvent.findOne({
        organizationId: connection.organizationId,
        channelType: ChannelType.CUSTOM_STORE,
        eventId,
      });

      if (existing) {
        return res.status(200).json({ status: 'ignored_duplicate', eventId });
      }

      await WebhookEvent.create({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        channelType: ChannelType.CUSTOM_STORE,
        topic,
        eventId,
        status: 'PROCESSED',
        payload: req.body,
        processedAt: new Date(),
      });

      return res.status(200).json({ status: 'processed', eventId });
    } catch (err: any) {
      logger.error('Custom webhook processing error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  private static async processShopifyOrder(connection: any, payload: any) {
    try {
      const externalOrderId = payload.id?.toString() || payload.order_number?.toString();
      if (!externalOrderId) return;

      const existingOrder = await Order.findOne({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        externalOrderId,
      });

      if (existingOrder) {
        logger.info(`Shopify order ${externalOrderId} already imported, skipping.`);
        return;
      }

      const totalAmount = parseFloat(payload.total_price || '0');
      const currency = payload.currency || 'USD';

      const order = await Order.create({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        channelType: ChannelType.SHOPIFY,
        externalOrderId,
        orderNumber: payload.name || `#${payload.order_number}`,
        customer: {
          name: `${payload.customer?.first_name || 'Guest'} ${payload.customer?.last_name || 'Customer'}`.trim(),
          email: payload.customer?.email || payload.email || 'customer@example.com',
          phone: payload.customer?.phone || '',
        },
        shippingAddress: {
          name: payload.shipping_address?.name || 'Customer',
          address1: payload.shipping_address?.address1 || '123 Main St',
          city: payload.shipping_address?.city || 'City',
          state: payload.shipping_address?.province || 'State',
          postalCode: payload.shipping_address?.zip || '00000',
          country: payload.shipping_address?.country || 'US',
        },
        subtotalPrice: totalAmount,
        totalPrice: totalAmount,
        currency,
        financialStatus: payload.financial_status === 'paid' ? OrderFinancialStatus.PAID : OrderFinancialStatus.PENDING,
        fulfillmentStatus: OrderFulfillmentStatus.UNFULFILLED,
        placedAt: new Date(payload.created_at || Date.now()),
      });

      // Line items
      if (Array.isArray(payload.line_items)) {
        for (const item of payload.line_items) {
          const itemSku = item.sku?.trim();
          let canonicalVariantId: any = undefined;
          let unitCost = 0;

          if (itemSku) {
            const variant = await ProductVariant.findOne({
              organizationId: connection.organizationId,
              sku: itemSku,
            });

            if (variant) {
              canonicalVariantId = variant._id;
              unitCost = variant.costPrice || 0;

              // Reserve inventory
              const invItem = await InventoryItem.findOne({
                organizationId: connection.organizationId,
                canonicalVariantId: variant._id,
              });

              if (invItem) {
                const prevTracked = invItem.trackedStock;
                const orderQty = item.quantity || 1;
                invItem.reservedStock += orderQty;
                invItem.availableToAllocate = Math.max(
                  0,
                  invItem.trackedStock - invItem.reservedStock - invItem.safetyStock
                );
                await invItem.save();

                await InventoryMovement.create({
                  organizationId: connection.organizationId,
                  canonicalVariantId: variant._id,
                  changeType: InventoryChangeType.ORDER_RESERVED,
                  quantityChanged: orderQty,
                  previousTrackedStock: prevTracked,
                  newTrackedStock: invItem.trackedStock,
                  reason: `Reserved for Shopify order ${order.orderNumber}`,
                  referenceId: order.orderNumber,
                });
              }
            }
          }

          await OrderLine.create({
            organizationId: connection.organizationId,
            orderId: order._id,
            externalLineId: item.id?.toString() || `line_${Date.now()}`,
            canonicalVariantId,
            sku: item.sku || 'UNKNOWN-SKU',
            title: item.title || 'Product Item',
            quantity: item.quantity || 1,
            unitPrice: parseFloat(item.price || '0'),
            unitCost,
            totalDiscount: 0,
            taxAmount: 0,
          });
        }
      }

      logger.info(`Shopify order ${order.orderNumber} successfully processed from webhook`);
    } catch (err: any) {
      logger.error('Failed to process Shopify order from webhook:', err);
    }
  }

  private static async processShopifyInventoryUpdate(connection: any, payload: any) {
    try {
      const inventoryItemId = String(payload.inventory_item_id);
      const available = typeof payload.available === 'number' ? payload.available : parseInt(payload.available);

      if (!inventoryItemId || isNaN(available)) return;

      const chProd = await ChannelProduct.findOne({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        $or: [
          { 'rawPayload.variant.inventory_item_id': inventoryItemId },
          { externalVariantId: inventoryItemId },
        ],
      });

      if (!chProd) return;

      chProd.inventoryQuantity = available;
      chProd.lastSyncedAt = new Date();
      await chProd.save();

      const mapping = await ProductMapping.findOne({
        organizationId: connection.organizationId,
        channelProductId: chProd._id,
        status: 'MAPPED',
        syncInventory: true,
      });

      if (mapping) {
        const item = await InventoryItem.findOne({
          organizationId: connection.organizationId,
          canonicalVariantId: mapping.canonicalVariantId,
        });

        if (item) {
          const previousStock = item.trackedStock;
          item.trackedStock = available;
          item.availableToAllocate = Math.max(0, available - item.reservedStock - item.safetyStock);
          item.version += 1;
          await item.save();

          await InventoryMovement.create({
            organizationId: connection.organizationId,
            canonicalVariantId: item.canonicalVariantId,
            changeType: InventoryChangeType.RECONCILIATION,
            quantityChanged: available - previousStock,
            previousTrackedStock: previousStock,
            newTrackedStock: available,
            reason: 'Webhook: Shopify inventory_levels/update',
          });

          await NotificationService.create({
            organizationId: connection.organizationId,
            title: `Shopify Inventory Modified`,
            message: `Inventory stock updated for SKU "${item.sku}": now ${available} units available on Shopify (${connection.name || 'Store'}).`,
            severity: NotificationSeverity.INFO,
            category: NotificationCategory.INVENTORY,
            channelType: ChannelType.SHOPIFY,
            link: '/inventory',
          });

          logger.info(`Updated canonical stock for SKU ${item.sku} from Shopify webhook: ${available}`);
        }
      }
    } catch (err: any) {
      logger.error('Failed to process Shopify inventory webhook:', err);
    }
  }

  private static async processShopifyProductCreate(connection: any, payload: any) {
    try {
      const productId = String(payload.id);
      if (!productId || !Array.isArray(payload.variants)) return;

      const { mappedCount } = await ShopifyService.ingestShopifyProduct({
        organizationId: connection.organizationId,
        connection,
        shopifyProduct: payload,
      });

      await NotificationService.notifyProductUploaded({
        organizationId: connection.organizationId,
        productTitle: payload.title || `Product #${productId}`,
        channelName: connection.name || 'Shopify',
        channelType: ChannelType.SHOPIFY,
        sku: payload.variants[0]?.sku,
      });

      logger.info(
        `Processed new Shopify product ${productId} from products/create webhook (${mappedCount} variants ingested & mapped)`
      );
    } catch (err: any) {
      logger.error('Failed to process Shopify product create webhook:', err);
    }
  }

  private static async processShopifyProductUpdate(connection: any, payload: any) {
    try {
      const productId = String(payload.id);
      if (!productId || !Array.isArray(payload.variants)) return;

      await ShopifyService.ingestShopifyProduct({
        organizationId: connection.organizationId,
        connection,
        shopifyProduct: payload,
      });

      await NotificationService.notifyProductModified({
        organizationId: connection.organizationId,
        productTitle: payload.title || `Product #${productId}`,
        source: `Shopify (${connection.name || 'Store'})`,
        channelType: ChannelType.SHOPIFY,
        changesSummary: `Updated variants and catalog mapping data.`,
        link: '/mappings',
      });

      logger.info(`Updated channel listings for Shopify product ${productId} from webhook`);
    } catch (err: any) {
      logger.error('Failed to process Shopify product webhook:', err);
    }
  }
}
