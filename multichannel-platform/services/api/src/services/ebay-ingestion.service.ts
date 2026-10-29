import mongoose from 'mongoose';
import {
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  InventoryMovement,
  ChannelProduct,
  ProductMapping,
} from '../database/models';
import {
  ChannelType,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
  MappingConfidence,
  ProductStatus,
  InventoryChangeType,
} from '@multichannel/shared';
import { logger } from '../utils/logger';
import { NotificationService } from './notification.service';

export interface IngestEbayItemParams {
  organizationId: mongoose.Types.ObjectId | string;
  connection: any;
  ebayItem: any;
  session?: mongoose.ClientSession;
}

export interface IngestEbayItemResult {
  canonicalProductId: any;
  canonicalVariantId: any;
  channelProductId: any;
  mappingId: any;
  isNewProduct: boolean;
  isNewVariant: boolean;
  sku: string;
  listingId: string;
}

export class EbayIngestionService {
  /**
   * Dedicated ingestion service that processes incoming eBay item payloads,
   * checks for existing SKU/ID matches in our database, and safely upserts
   * new products into our platform catalog and establishes strict 1:1 mappings.
   */
  static async ingestItem(params: IngestEbayItemParams): Promise<IngestEbayItemResult> {
    const { organizationId, connection, ebayItem } = params;

    const listingId = String(
      ebayItem.listingId || ebayItem.itemId || ebayItem.offerId || ''
    ).trim();

    // Extract or generate deterministic SKU
    let rawSku = (ebayItem.sku || ebayItem.SKU || ebayItem.customLabel || '').trim();
    if (!rawSku && listingId) {
      rawSku = `EBAY-${listingId}`;
    }
    if (!rawSku) {
      rawSku = `EBAY-ITEM-${Date.now()}`;
    }
    const cleanSku = rawSku.toUpperCase();

    const title = (
      ebayItem.title ||
      ebayItem.product?.title ||
      ebayItem.Item?.Title ||
      cleanSku
    ).trim();

    const description = (
      ebayItem.description ||
      ebayItem.product?.description ||
      ebayItem.Item?.Description ||
      title
    ).trim();

    // Price extraction
    let price = 0;
    if (typeof ebayItem.price === 'number') {
      price = ebayItem.price;
    } else if (typeof ebayItem.price?.value === 'string' || typeof ebayItem.price?.value === 'number') {
      price = parseFloat(String(ebayItem.price.value)) || 0;
    } else if (typeof ebayItem.price === 'string') {
      price = parseFloat(ebayItem.price) || 0;
    } else if (ebayItem.pricingSummary?.price?.value) {
      price = parseFloat(String(ebayItem.pricingSummary.price.value)) || 0;
    } else if (ebayItem.Item?.SellingStatus?.CurrentPrice?.Value) {
      price = parseFloat(String(ebayItem.Item.SellingStatus.CurrentPrice.Value)) || 0;
    }

    // Quantity extraction
    let quantity = 0;
    if (typeof ebayItem.quantity === 'number') {
      quantity = ebayItem.quantity;
    } else if (typeof ebayItem.availableQuantity === 'number') {
      quantity = ebayItem.availableQuantity;
    } else if (ebayItem.availability?.shipToLocationAvailability?.quantity !== undefined) {
      quantity = parseInt(String(ebayItem.availability.shipToLocationAvailability.quantity), 10) || 0;
    } else if (ebayItem.Item?.Quantity !== undefined) {
      quantity = parseInt(String(ebayItem.Item.Quantity), 10) || 0;
    } else if (typeof ebayItem.quantity === 'string') {
      quantity = parseInt(ebayItem.quantity, 10) || 0;
    }
    quantity = Math.max(0, quantity);

    const offerId = ebayItem.offerId || '';
    const rawImages = Array.isArray(ebayItem.images) && ebayItem.images.length > 0
      ? ebayItem.images
      : (ebayItem.product?.imageUrls || ebayItem.Item?.PictureDetails?.PictureURL || []);
    const images: string[] = (Array.isArray(rawImages) ? rawImages : [rawImages])
      .filter((url: any) => typeof url === 'string' && url.startsWith('http'));

    const brand =
      ebayItem.aspects?.Brand?.[0] ||
      ebayItem.product?.aspects?.Brand?.[0] ||
      ebayItem.brand ||
      'Generic';

    const category =
      ebayItem.aspects?.Type?.[0] ||
      ebayItem.product?.aspects?.Type?.[0] ||
      ebayItem.category ||
      'General';

    // 1. Idempotently find or create ChannelProduct
    let channelProduct = await ChannelProduct.findOne({
      organizationId,
      channelConnectionId: connection._id,
      $or: [
        ...(listingId ? [{ externalProductId: listingId }] : []),
        { sku: cleanSku },
      ],
    });

    const channelProductPayload: any = {
      organizationId,
      channelConnectionId: connection._id,
      channelType: ChannelType.EBAY,
      externalProductId: listingId || cleanSku,
      externalVariantId: cleanSku,
      externalListingId: listingId || undefined,
      title,
      sku: cleanSku,
      barcode: '',
      price,
      inventoryQuantity: quantity,
      status: ChannelProductStatus.ACTIVE,
      syncStatus: SyncStatus.SYNCED,
      lastSyncedAt: new Date(),
      rawPayload: {
        ebayItem: ebayItem.raw || ebayItem,
        images,
        description,
        listingId,
        offerId,
      },
    };

    if (channelProduct) {
      Object.assign(channelProduct, channelProductPayload);
      await channelProduct.save();
    } else {
      channelProduct = await ChannelProduct.create(channelProductPayload);
    }

    // 2. Find or match CanonicalProduct
    let isNewProduct = false;
    let canonicalProduct = await CanonicalProduct.findOne({
      organizationId,
      $or: [
        { masterSku: cleanSku },
        { title: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ],
    });

    if (!canonicalProduct) {
      const existingVariant = await ProductVariant.findOne({
        organizationId,
        sku: cleanSku,
      });

      if (existingVariant) {
        canonicalProduct = await CanonicalProduct.findById(existingVariant.canonicalProductId);
      }
    }

    if (!canonicalProduct) {
      canonicalProduct = await CanonicalProduct.create({
        organizationId,
        title,
        masterSku: cleanSku,
        description,
        brand,
        category,
        tags: ['eBay'],
        images: images.map((url: string, idx: number) => ({
          url,
          altText: title,
          position: idx + 1,
          isPrimary: idx === 0,
        })),
        defaultCostPrice: 0,
        defaultRetailPrice: price,
        totalVariants: 1,
        status: ProductStatus.ACTIVE,
      });
      isNewProduct = true;
      logger.info(`[eBay Ingestion] Created new CanonicalProduct "${title}" (SKU: ${cleanSku})`);
    } else {
      // Sync price or images if canonical product had empty fields
      let canonicalChanged = false;
      if (price > 0 && (!canonicalProduct.defaultRetailPrice || canonicalProduct.defaultRetailPrice === 0)) {
        canonicalProduct.defaultRetailPrice = price;
        canonicalChanged = true;
      }
      if (canonicalProduct.images.length === 0 && images.length > 0) {
        canonicalProduct.images = images.map((url: string, idx: number) => ({
          url,
          altText: title,
          position: idx + 1,
          isPrimary: idx === 0,
        }));
        canonicalChanged = true;
      }
      if (canonicalChanged) {
        await canonicalProduct.save();
      }
    }

    // 3. Find or create ProductVariant
    let isNewVariant = false;
    let variant = await ProductVariant.findOne({
      organizationId,
      canonicalProductId: canonicalProduct._id,
      sku: cleanSku,
    });

    if (!variant) {
      variant = await ProductVariant.create({
        organizationId,
        canonicalProductId: canonicalProduct._id,
        sku: cleanSku,
        title,
        costPrice: 0,
        retailPrice: price,
      });
      isNewVariant = true;
      logger.info(`[eBay Ingestion] Created ProductVariant for SKU ${cleanSku}`);
    } else {
      if (price > 0 && (!variant.retailPrice || variant.retailPrice === 0)) {
        variant.retailPrice = price;
        await variant.save();
      }
    }

    // 4. Ensure InventoryItem exists and tracks stock
    let invItem = await InventoryItem.findOne({
      organizationId,
      canonicalVariantId: variant._id,
    });

    if (!invItem) {
      invItem = await InventoryItem.create({
        organizationId,
        canonicalVariantId: variant._id,
        sku: cleanSku,
        trackedStock: quantity,
        reservedStock: 0,
        safetyStock: 0,
        availableToAllocate: quantity,
        lowStockThreshold: 5,
      });

      if (quantity > 0) {
        await InventoryMovement.create({
          organizationId,
          canonicalVariantId: variant._id,
          changeType: InventoryChangeType.RESTOCK,
          quantityChanged: quantity,
          previousTrackedStock: 0,
          newTrackedStock: quantity,
          reason: `Ingested from eBay item ${listingId || cleanSku}`,
        });
      }
    } else {
      // Update inventory level if changed
      if (invItem.trackedStock !== quantity) {
        const diff = quantity - invItem.trackedStock;
        const prevStock = invItem.trackedStock;
        invItem.trackedStock = quantity;
        invItem.availableToAllocate = Math.max(0, quantity - (invItem.reservedStock || 0) - (invItem.safetyStock || 0));
        await invItem.save();

        await InventoryMovement.create({
          organizationId,
          canonicalVariantId: variant._id,
          changeType: InventoryChangeType.RECONCILIATION,
          quantityChanged: diff,
          previousTrackedStock: prevStock,
          newTrackedStock: quantity,
          reason: `Synchronized stock from eBay (${prevStock} -> ${quantity})`,
        });
      }
    }

    // 5. Establish unique ProductMapping
    let mapping = await ProductMapping.findOne({
      organizationId,
      $or: [
        { channelProductId: channelProduct._id },
        { canonicalVariantId: variant._id, channelConnectionId: connection._id },
      ],
    });

    if (mapping) {
      mapping.canonicalProductId = canonicalProduct._id;
      mapping.canonicalVariantId = variant._id;
      mapping.channelConnectionId = connection._id;
      mapping.channelProductId = channelProduct._id;
      mapping.channelType = ChannelType.EBAY;
      mapping.mappingConfidence = MappingConfidence.EXACT_SKU;
      mapping.syncPrice = true;
      mapping.syncInventory = true;
      mapping.status = MappingStatus.MAPPED;
      mapping.updatedAt = new Date();
      mapping.unmappedAt = undefined;
      mapping.unmappedReason = undefined;
      await mapping.save();
    } else {
      mapping = await ProductMapping.create({
        organizationId,
        canonicalProductId: canonicalProduct._id,
        canonicalVariantId: variant._id,
        channelConnectionId: connection._id,
        channelProductId: channelProduct._id,
        channelType: ChannelType.EBAY,
        mappingConfidence: MappingConfidence.EXACT_SKU,
        syncPrice: true,
        syncInventory: true,
        status: MappingStatus.MAPPED,
      });
    }

    if (isNewProduct) {
      await NotificationService.notifyProductUploaded({
        organizationId,
        productTitle: title,
        channelName: connection.name || 'eBay',
        channelType: ChannelType.EBAY,
        sku: cleanSku,
      });
    }

    return {
      canonicalProductId: canonicalProduct._id,
      canonicalVariantId: variant._id,
      channelProductId: channelProduct._id,
      mappingId: mapping._id,
      isNewProduct,
      isNewVariant,
      sku: cleanSku,
      listingId,
    };
  }
}

