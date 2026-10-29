import {
  ChannelConnection,
  ProductMapping,
  ProductVariant,
  InventoryItem,
  ChannelProduct,
} from '../database/models';
import {
  ChannelType,
  ChannelStatus,
  MappingStatus,
} from '@multichannel/shared';
import { EbayService } from './ebay.service';
import { ShopifyService } from './shopify.service';
import { logger } from '../utils/logger';

export class SyncSchedulerService {
  private static timer: NodeJS.Timeout | null = null;
  private static isRunning = false;
  private static readonly DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Start the background bi-directional synchronization scheduler
   */
  static start() {
    if (this.timer) {
      logger.info('SyncSchedulerService is already running');
      return;
    }

    const intervalMs = parseInt(process.env.SYNC_POLL_INTERVAL_MS || '', 10) || this.DEFAULT_INTERVAL_MS;
    logger.info(`Starting SyncSchedulerService (polling interval: ${intervalMs / 1000}s)`);

    // Initial sync pass 15 seconds after startup
    setTimeout(() => {
      this.runSyncCycle().catch((err) =>
        logger.error(`Initial SyncSchedulerService cycle error: ${err.message}`)
      );
    }, 15000);

    // Recurring sync interval
    this.timer = setInterval(() => {
      this.runSyncCycle().catch((err) =>
        logger.error(`Periodic SyncSchedulerService cycle error: ${err.message}`)
      );
    }, intervalMs);
  }

  /**
   * Stop the scheduler
   */
  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('SyncSchedulerService stopped');
    }
  }

  /**
   * Run a single bi-directional synchronization cycle
   */
  static async runSyncCycle(): Promise<void> {
    if (this.isRunning) {
      logger.debug('SyncSchedulerService cycle already in progress, skipping overlapping run');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Find all active channels
      const activeConnections = await ChannelConnection.find({
        status: ChannelStatus.ACTIVE,
      });

      if (activeConnections.length === 0) {
        return;
      }

      for (const conn of activeConnections) {
        try {
          if (conn.channelType === ChannelType.EBAY) {
            await this.syncEbayChannel(conn);
          } else if (conn.channelType === ChannelType.SHOPIFY) {
            await this.syncShopifyChannel(conn);
          }
        } catch (connErr: any) {
          logger.warn(`SyncSchedulerService error on channel ${conn.name}: ${connErr.message}`);
        }
      }
    } catch (err: any) {
      logger.error('SyncSchedulerService runSyncCycle error:', err);
    } finally {
      this.isRunning = false;
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.debug(`SyncSchedulerService cycle completed in ${duration}s`);
    }
  }

  /**
   * Bi-directional sync for an eBay channel
   */
  private static async syncEbayChannel(conn: any) {
    // 1. Inbound sync: Fetch latest inventory from eBay and ensure mappings are up to date
    try {
      const { syncedCount } = await EbayService.syncAllEbayProducts(conn, conn.organizationId);
      if (syncedCount > 0) {
        logger.info(`SyncScheduler: Ingested/confirmed ${syncedCount} eBay items for ${conn.name}`);
      }
    } catch (inboundErr: any) {
      logger.warn(`SyncScheduler: Inbound eBay sync warning for ${conn.name}: ${inboundErr.message}`);
    }

    // 2. Outbound sync: Push any pending platform inventory & price changes to eBay
    try {
      const mappings = await ProductMapping.find({
        organizationId: conn.organizationId,
        channelConnectionId: conn._id,
        status: MappingStatus.MAPPED,
      })
        .populate('canonicalVariantId')
        .populate('canonicalProductId')
        .populate('channelProductId');

      const { host, token } = await EbayService.getValidCredentials(conn);
      const marketplaceId = conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : undefined);

      for (const mapping of mappings) {
        const variant: any = mapping.canonicalVariantId;
        const canonicalProduct: any = mapping.canonicalProductId;
        const chProd: any = mapping.channelProductId;

        if (!variant || !chProd || !chProd.sku) continue;

        const invItem = await InventoryItem.findOne({
          organizationId: conn.organizationId,
          canonicalVariantId: variant._id,
        });

        const currentStock = invItem?.availableToAllocate ?? 0;
        const currentPrice = variant.retailPrice || canonicalProduct?.defaultRetailPrice || 0;

        // Check if platform data has changed compared to channel product record
        const stockChanged = mapping.syncInventory && chProd.inventoryQuantity !== currentStock;
        const priceChanged = mapping.syncPrice && currentPrice > 0 && Math.abs(chProd.price - currentPrice) > 0.009;

        if (stockChanged || priceChanged) {
          const images = (canonicalProduct?.images || [])
            .map((img: any) => (typeof img === 'string' ? img : img.url))
            .filter(Boolean);

          const setResult = await EbayService.setInventoryItem(host, token, chProd.sku, {
            title: canonicalProduct?.title || variant.title,
            description: canonicalProduct?.description || variant.title,
            quantity: currentStock,
            price: currentPrice,
            images,
            brand: canonicalProduct?.brand || 'Generic',
            marketplaceId,
          });

          if (setResult?.success) {
            chProd.inventoryQuantity = currentStock;
            chProd.price = currentPrice;
            chProd.lastSyncedAt = new Date();
            await chProd.save();
            logger.info(`SyncScheduler: Auto-pushed updated stock (${currentStock}) & price (${currentPrice}) to eBay for SKU ${chProd.sku}`);
          }
        }
      }
    } catch (outboundErr: any) {
      logger.warn(`SyncScheduler: Outbound eBay sync warning for ${conn.name}: ${outboundErr.message}`);
    }
  }

  /**
   * Bi-directional sync for a Shopify channel
   */
  private static async syncShopifyChannel(conn: any) {
    try {
      const { domain, token } = ShopifyService.getCredentials(conn);
      const mappings = await ProductMapping.find({
        organizationId: conn.organizationId,
        channelConnectionId: conn._id,
        status: MappingStatus.MAPPED,
      })
        .populate('canonicalVariantId')
        .populate('channelProductId');

      for (const mapping of mappings) {
        const variant: any = mapping.canonicalVariantId;
        const chProd: any = mapping.channelProductId;
        if (!variant || !chProd) continue;

        const invItem = await InventoryItem.findOne({
          organizationId: conn.organizationId,
          canonicalVariantId: variant._id,
        });

        const currentStock = invItem?.availableToAllocate ?? 0;
        const currentPrice = variant.retailPrice || 0;

        const stockChanged = mapping.syncInventory && chProd.inventoryQuantity !== currentStock;
        const priceChanged = mapping.syncPrice && currentPrice > 0 && Math.abs(chProd.price - currentPrice) > 0.009;

        if (stockChanged && chProd.rawPayload?.variant?.inventory_item_id) {
          await ShopifyService.setInventoryLevel(
            domain,
            token,
            String(chProd.rawPayload.variant.inventory_item_id),
            currentStock
          );
          chProd.inventoryQuantity = currentStock;
        }

        if (priceChanged && chProd.externalVariantId) {
          await ShopifyService.updateVariantPrice(domain, token, chProd.externalVariantId, currentPrice);
          chProd.price = currentPrice;
        }

        if (stockChanged || priceChanged) {
          chProd.lastSyncedAt = new Date();
          await chProd.save();
        }
      }
    } catch (err: any) {
      logger.warn(`SyncScheduler: Shopify sync warning for ${conn.name}: ${err.message}`);
    }
  }
}
