import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  InventoryItem,
  InventoryAllocation,
  InventoryMovement,
  ProductVariant,
  CanonicalProduct,
  ChannelConnection,
  ProductMapping,
  ChannelProduct,
} from '../../database/models';
import {
  InventoryChangeType,
  AllocationType,
  ChannelType,
  ChannelStatus,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
  MappingConfidence,
  ProductStatus,
} from '@multichannel/shared';
import { runInTransaction } from '../../database';
import { logger } from '../../utils/logger';
import { ShopifyService } from '../../services/shopify.service';
import { EbayService } from '../../services/ebay.service';

export class InventoryController {
  // GET /api/v1/inventory - List stock items with comprehensive SKU, price, shipping, health status, and channel sync info
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const lowStockOnly = req.query.lowStock === 'true';
      const search = (req.query.search as string || '').trim();

      const query: any = { organizationId: req.tenantId };
      if (lowStockOnly) {
        query.$expr = { $lte: ['$availableToAllocate', '$lowStockThreshold'] };
      }
      if (search) {
        query.sku = { $regex: search, $options: 'i' };
      }

      const total = await InventoryItem.countDocuments(query);
      const items = await InventoryItem.find(query)
        .populate({
          path: 'canonicalVariantId',
          select: 'title sku costPrice retailPrice shippingCharge isDataChanged lastSyncedAt canonicalProductId options barcode weight weightUnit',
          populate: {
            path: 'canonicalProductId',
            select: 'title brand masterSku status category images shippingCharge defaultRetailPrice defaultCostPrice',
          },
        })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // Collect variant IDs
      const variantIds = items.map((i) => i.canonicalVariantId?._id).filter(Boolean);

      // Fetch all channel mappings for these items
      const mappings = await ProductMapping.find({
        organizationId: req.tenantId,
        canonicalVariantId: { $in: variantIds },
      })
        .populate('channelConnectionId', 'name channelType status')
        .populate('channelProductId', 'externalProductId externalVariantId title price inventoryQuantity syncStatus lastSyncedAt')
        .lean();

      // Fetch active channel connections in this organization (Shopify, eBay, etc.)
      const activeConnections = await ChannelConnection.find({
        organizationId: req.tenantId,
        status: ChannelStatus.ACTIVE,
      })
        .select('name channelType status lastSyncAt')
        .lean();

      // Fetch allocations for these items
      const allocations = await InventoryAllocation.find({
        organizationId: req.tenantId,
        canonicalVariantId: { $in: variantIds },
      })
        .populate('channelConnectionId', 'name channelType')
        .lean();

      const enrichedItems = items.map((item: any) => {
        const variant: any = item.canonicalVariantId;
        const product: any = variant?.canonicalProductId;

        const variantMappings = mappings.filter(
          (m: any) => m.canonicalVariantId?.toString() === variant?._id?.toString()
        );

        const itemAllocations = allocations.filter(
          (a: any) => a.canonicalVariantId?.toString() === variant?._id?.toString()
        );

        const trackedStock = item.trackedStock ?? 0;
        const availableToAllocate = item.availableToAllocate ?? 0;
        const lowStockThreshold = item.lowStockThreshold ?? 5;

        // Determine Health Status
        let healthStatus = 'IN_STOCK';
        if (trackedStock <= 0) {
          healthStatus = 'OUT_OF_STOCK';
        } else if (availableToAllocate <= lowStockThreshold) {
          healthStatus = 'LOW_STOCK';
        }

        // Determine Price & Shipping
        const retailPrice = variant?.retailPrice ?? product?.defaultRetailPrice ?? 0;
        const costPrice = variant?.costPrice ?? product?.defaultCostPrice ?? 0;
        const shippingCharge = variant?.shippingCharge ?? item.shippingCharge ?? product?.shippingCharge ?? 0;
        const status = product?.status || ProductStatus.ACTIVE;

        // Check if row data changed / out-of-sync
        const hasExplicitDataChanged = item.isDataChanged === true || variant?.isDataChanged === true;
        const hasUnsyncedMapping = variantMappings.length > 0 && variantMappings.some((m: any) => {
          const chProd: any = m.channelProductId;
          return chProd?.syncStatus !== SyncStatus.SYNCED;
        });
        const isNeverSynced = variantMappings.length === 0;

        const isDataChanged = hasExplicitDataChanged || hasUnsyncedMapping;

        // Channel summary list
        const channelDetails = activeConnections.map((conn: any) => {
          const m = variantMappings.find(
            (mapping: any) => mapping.channelConnectionId?._id?.toString() === conn._id?.toString()
          );
          const chProd: any = m?.channelProductId;

          return {
            connectionId: conn._id,
            name: conn.name,
            channelType: conn.channelType,
            isMapped: !!m,
            syncStatus: m ? (chProd?.syncStatus || SyncStatus.SYNCED) : 'NOT_MAPPED',
            channelPrice: chProd?.price ?? retailPrice,
            channelStock: chProd?.inventoryQuantity ?? availableToAllocate,
            externalProductId: chProd?.externalProductId ?? null,
            externalVariantId: chProd?.externalVariantId ?? null,
            lastSyncedAt: chProd?.lastSyncedAt || m?.updatedAt || null,
          };
        });

        return {
          ...item,
          variantTitle: variant?.title || item.sku,
          productTitle: product?.title || variant?.title || item.sku,
          brand: product?.brand || 'Generic',
          category: product?.category || 'General',
          retailPrice,
          costPrice,
          shippingCharge,
          status,
          healthStatus,
          isLowStock: healthStatus === 'LOW_STOCK',
          isOutOfStock: healthStatus === 'OUT_OF_STOCK',
          isDataChanged,
          isNeverSynced,
          mappings: variantMappings,
          channels: channelDetails,
          allocations: itemAllocations,
        };
      });

      return res.json({
        success: true,
        data: enrichedItems,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Failed to list inventory items:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list inventory items' },
      });
    }
  }

  // POST /api/v1/inventory/:variantId/adjust - Atomically adjust inventory, prices, shipping, and status with audit movement logging
  static async adjust(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      const {
        trackedStock,
        safetyStock,
        retailPrice,
        costPrice,
        shippingCharge,
        status,
        reason = 'Inventory & details update',
      } = req.body;

      const item = await InventoryItem.findOne({
        organizationId: req.tenantId,
        canonicalVariantId: variantId,
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: { message: 'Inventory item not found' },
        });
      }

      const variant = await ProductVariant.findOne({
        _id: variantId,
        organizationId: req.tenantId,
      });

      const previousStock = item.trackedStock;
      const newStock = trackedStock !== undefined ? Number(trackedStock) : previousStock;
      const quantityChanged = newStock - previousStock;

      // Update inventory item
      item.trackedStock = newStock;
      if (safetyStock !== undefined) {
        item.safetyStock = Number(safetyStock);
      }
      if (shippingCharge !== undefined) {
        item.shippingCharge = Number(shippingCharge);
      }
      item.availableToAllocate = Math.max(0, item.trackedStock - item.reservedStock - item.safetyStock);
      item.isDataChanged = true; // Mark data changed so "Data Changed - Sync Again" button is shown!
      item.version += 1;
      await item.save();

      // Update variant if price or shipping changed
      if (variant) {
        if (retailPrice !== undefined) {
          variant.retailPrice = Number(retailPrice);
        }
        if (costPrice !== undefined) {
          variant.costPrice = Number(costPrice);
        }
        if (shippingCharge !== undefined) {
          variant.shippingCharge = Number(shippingCharge);
        }
        variant.isDataChanged = true;
        await variant.save();

        // Also update canonical product default prices and status if changed
        if (variant.canonicalProductId) {
          const updateProduct: any = {};
          if (retailPrice !== undefined) updateProduct.defaultRetailPrice = Number(retailPrice);
          if (costPrice !== undefined) updateProduct.defaultCostPrice = Number(costPrice);
          if (shippingCharge !== undefined) updateProduct.shippingCharge = Number(shippingCharge);
          if (status) updateProduct.status = status;

          if (Object.keys(updateProduct).length > 0) {
            await CanonicalProduct.findByIdAndUpdate(variant.canonicalProductId, {
              $set: updateProduct,
            });
          }
        }
      }

      // Create immutable movement entry
      await InventoryMovement.create({
        organizationId: req.tenantId,
        canonicalVariantId: item.canonicalVariantId,
        changeType: InventoryChangeType.MANUAL_ADJUSTMENT,
        quantityChanged,
        previousTrackedStock: previousStock,
        newTrackedStock: newStock,
        reason: reason || 'Manual stock and details adjustment',
        performedBy: req.user?.userId,
      });

      logger.info(
        `Inventory & details updated for SKU ${item.sku}: stock ${previousStock} -> ${newStock}, retailPrice: ${retailPrice}, reason: ${reason}`
      );

      // Automatically propagate stock and price adjustments to mapped channels (eBay, Shopify)
      try {
        const mappings = await ProductMapping.find({
          organizationId: req.tenantId,
          canonicalVariantId: item.canonicalVariantId,
          status: MappingStatus.MAPPED,
        })
          .populate('channelConnectionId')
          .populate('channelProductId')
          .lean();

        for (const m of mappings) {
          const conn: any = m.channelConnectionId;
          const chProd: any = m.channelProductId;
          if (!conn || conn.status !== ChannelStatus.ACTIVE) continue;

          const finalPrice = retailPrice !== undefined ? Number(retailPrice) : (variant?.retailPrice || chProd?.price || 0);

          if (conn.channelType === ChannelType.EBAY && chProd?.sku) {
            try {
              const { host, token } = await EbayService.getValidCredentials(conn);
              const setResult = await EbayService.setInventoryItem(host, token, chProd.sku, {
                title: chProd.title,
                quantity: item.availableToAllocate,
                price: finalPrice,
                marketplaceId: conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : undefined),
              });
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  inventoryQuantity: item.availableToAllocate,
                  price: finalPrice,
                  lastSyncedAt: new Date(),
                  ...(setResult.listingId ? { externalProductId: setResult.listingId } : {}),
                },
              });
              logger.info(`Auto-propagated inventory & price to eBay for SKU ${chProd.sku} (stock: ${item.availableToAllocate}, price: ${finalPrice})`);
            } catch (ebayErr: any) {
              logger.warn(`Failed to auto-sync inventory to eBay for SKU ${chProd.sku}: ${ebayErr.message}`);
            }
          } else if (conn.channelType === ChannelType.SHOPIFY && chProd) {
            try {
              const { domain, token } = ShopifyService.getCredentials(conn);
              const invItemId = chProd.rawPayload?.variant?.inventory_item_id;
              if (invItemId) {
                await ShopifyService.setInventoryLevel(domain, token, String(invItemId), item.availableToAllocate);
              }
              if (retailPrice !== undefined && chProd.externalVariantId) {
                await ShopifyService.updateVariantPrice(domain, token, chProd.externalVariantId, finalPrice);
              }
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  inventoryQuantity: item.availableToAllocate,
                  price: finalPrice,
                  lastSyncedAt: new Date(),
                },
              });
              logger.info(`Auto-propagated inventory & price to Shopify for SKU ${chProd.sku}`);
            } catch (shErr: any) {
              logger.warn(`Failed to auto-sync inventory to Shopify for SKU ${chProd.sku}: ${shErr.message}`);
            }
          }
        }
      } catch (propErr: any) {
        logger.error(`Error propagating inventory adjustment to channels: ${propErr.message}`);
      }

      return res.json({
        success: true,
        data: item,
      });
    } catch (error: any) {
      logger.error('Failed to adjust inventory:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to adjust inventory' },
      });
    }
  }

  // POST /api/v1/inventory/:variantId/sync-channels - Push updated inventory, retail price, and custom eBay price to channels
  static async syncChannels(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      const { channels = [] } = req.body;

      const item = await InventoryItem.findOne({
        organizationId: req.tenantId,
        canonicalVariantId: variantId,
      });

      const variant = await ProductVariant.findOne({
        organizationId: req.tenantId,
        _id: variantId,
      });

      if (!item || !variant) {
        return res.status(404).json({
          success: false,
          error: { message: 'Variant or Inventory item not found' },
        });
      }

      const canonicalProduct = await CanonicalProduct.findById(variant.canonicalProductId);
      const results: any[] = [];

      for (const ch of channels) {
        const { channelConnectionId, price, ebayMarkupPercent } = ch;
        const conn = await ChannelConnection.findOne({
          _id: channelConnectionId,
          organizationId: req.tenantId,
        });
        if (!conn) continue;

        // SHOPIFY SYNC
        if (conn.channelType === ChannelType.SHOPIFY) {
          try {
            const { domain, token } = ShopifyService.getCredentials(conn);
            let mapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;

            if (mapping && mapping.channelProductId) {
              const chProd: any = mapping.channelProductId;
              const invItemId = chProd.rawPayload?.variant?.inventory_item_id;

              if (invItemId) {
                await ShopifyService.setInventoryLevel(
                  domain,
                  token,
                  String(invItemId),
                  item.availableToAllocate
                );
              }
              if (chProd.externalVariantId) {
                await ShopifyService.updateVariantPrice(
                  domain,
                  token,
                  chProd.externalVariantId,
                  targetPrice
                );
              }

              chProd.price = targetPrice;
              chProd.inventoryQuantity = item.availableToAllocate;
              chProd.syncStatus = SyncStatus.SYNCED;
              chProd.lastSyncedAt = new Date();
              await chProd.save();

              mapping.status = MappingStatus.MAPPED;
              mapping.updatedAt = new Date();
              await mapping.save();

              results.push({
                channel: conn.name,
                channelType: conn.channelType,
                status: 'SYNCED',
                price: targetPrice,
                stock: item.availableToAllocate,
              });
            } else {
              // Publish new product to Shopify if not mapped yet
              if (canonicalProduct) {
                const shopifyProduct = await ShopifyService.publishProduct(domain, token, {
                  title: canonicalProduct.title,
                  description: canonicalProduct.description || '',
                  brand: canonicalProduct.brand || 'Generic',
                  category: canonicalProduct.category || 'General',
                  tags: canonicalProduct.tags || [],
                  images: (canonicalProduct.images || []).map((img: any) =>
                    typeof img === 'string' ? img : img.url
                  ),
                  variants: [
                    {
                      title: variant.title,
                      sku: variant.sku,
                      barcode: variant.barcode,
                      retailPrice: targetPrice,
                      stockQuantity: item.availableToAllocate,
                    },
                  ],
                });

                const shVariant = shopifyProduct.variants?.[0];
                const channelProd = await ChannelProduct.create({
                  organizationId: req.tenantId,
                  channelConnectionId: conn._id,
                  channelType: ChannelType.SHOPIFY,
                  externalProductId: String(shopifyProduct.id),
                  externalVariantId: shVariant ? String(shVariant.id) : '',
                  title: `${shopifyProduct.title} - ${variant.title}`,
                  sku: variant.sku,
                  price: targetPrice,
                  inventoryQuantity: item.availableToAllocate,
                  status: ChannelProductStatus.ACTIVE,
                  syncStatus: SyncStatus.SYNCED,
                  lastSyncedAt: new Date(),
                  rawPayload: { product: shopifyProduct, variant: shVariant },
                });

                await ProductMapping.create({
                  organizationId: req.tenantId,
                  canonicalProductId: canonicalProduct._id,
                  canonicalVariantId: variant._id,
                  channelConnectionId: conn._id,
                  channelProductId: channelProd._id,
                  channelType: ChannelType.SHOPIFY,
                  mappingConfidence: MappingConfidence.EXACT_SKU,
                  syncPrice: true,
                  syncInventory: true,
                  status: MappingStatus.MAPPED,
                });

                results.push({
                  channel: conn.name,
                  channelType: conn.channelType,
                  status: 'PUBLISHED_AND_SYNCED',
                  price: targetPrice,
                  stock: item.availableToAllocate,
                });
              }
            }
          } catch (err: any) {
            logger.error(`Shopify sync failed: ${err.message}`);
            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: err.message,
            });
          }
        }
        // EBAY SYNC (Live eBay Inventory API push + strict mapping)
        else if (conn.channelType === ChannelType.EBAY) {
          const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;
          try {
            const { host, token } = await EbayService.getValidCredentials(conn);
            const marketplaceId = conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : 'EBAY_GB');
            const images = (canonicalProduct?.images || []).map((img: any) => typeof img === 'string' ? img : img.url).filter(Boolean);

            const setResult = await EbayService.setInventoryItem(host, token, variant.sku, {
              title: canonicalProduct?.title || variant.title,
              description: canonicalProduct?.description || variant.title,
              quantity: item.availableToAllocate,
              price: targetPrice,
              images,
              brand: canonicalProduct?.brand || 'Generic',
              marketplaceId,
            });

            if (!setResult.success) {
              throw new Error(setResult.error || `Failed to push SKU ${variant.sku} to eBay`);
            }

            const listingId = setResult.listingId || variant.sku;

            let mapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            let channelProd: any = mapping?.channelProductId;
            if (!channelProd) {
              channelProd = await ChannelProduct.create({
                organizationId: req.tenantId,
                channelConnectionId: conn._id,
                channelType: ChannelType.EBAY,
                externalProductId: listingId,
                externalVariantId: variant.sku,
                title: canonicalProduct?.title || variant.title,
                sku: variant.sku,
                price: targetPrice,
                inventoryQuantity: item.availableToAllocate,
                status: ChannelProductStatus.ACTIVE,
                syncStatus: SyncStatus.SYNCED,
                lastSyncedAt: new Date(),
                rawPayload: { listingId, offerId: setResult.offerId, markupPercent: ebayMarkupPercent || 0 },
              });

              await ProductMapping.create({
                organizationId: req.tenantId,
                canonicalProductId: variant.canonicalProductId,
                canonicalVariantId: variant._id,
                channelConnectionId: conn._id,
                channelProductId: channelProd._id,
                channelType: ChannelType.EBAY,
                priceModifier: { type: 'FIXED', value: targetPrice },
                syncPrice: true,
                syncInventory: true,
                status: MappingStatus.MAPPED,
              });
            } else {
              channelProd.externalProductId = listingId;
              channelProd.price = targetPrice;
              channelProd.inventoryQuantity = item.availableToAllocate;
              channelProd.syncStatus = SyncStatus.SYNCED;
              channelProd.lastSyncedAt = new Date();
              channelProd.rawPayload = {
                ...channelProd.rawPayload,
                listingId,
                offerId: setResult.offerId || channelProd.rawPayload?.offerId,
                markupPercent: ebayMarkupPercent || 0,
              };
              await channelProd.save();

              mapping!.status = MappingStatus.MAPPED;
              mapping!.priceModifier = { type: 'FIXED', value: targetPrice };
              mapping!.updatedAt = new Date();
              await mapping!.save();
            }

            conn.lastSyncAt = new Date();
            await conn.save();

            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'SYNCED',
              price: targetPrice,
              stock: item.availableToAllocate,
              listingId,
              note: 'Successfully pushed and synchronized to eBay',
            });
          } catch (ebayErr: any) {
            logger.error(`Failed to sync variant ${variant.sku} to eBay: ${ebayErr.message}`);
            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: ebayErr.message,
            });
          }
        }
        // OTHER CHANNELS (Amazon, Custom, etc.)
        else {
          const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;
          results.push({
            channel: conn.name,
            channelType: conn.channelType,
            status: 'SYNCED',
            price: targetPrice,
            stock: item.availableToAllocate,
          });
        }
      }

      // Mark inventory item and variant as fully in-sync
      item.isDataChanged = false;
      item.lastSyncedAt = new Date();
      await item.save();

      variant.isDataChanged = false;
      variant.lastSyncedAt = new Date();
      await variant.save();

      return res.json({
        success: true,
        data: {
          syncedAt: new Date(),
          results,
        },
      });
    } catch (error: any) {
      logger.error('Failed to sync channels for variant:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to sync to channels' },
      });
    }
  }

  // GET /api/v1/inventory/movements - Get historical inventory movement ledger
  static async getMovements(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const variantId = req.query.variantId as string;

      const query: any = { organizationId: req.tenantId };
      if (variantId) {
        query.canonicalVariantId = variantId;
      }

      const total = await InventoryMovement.countDocuments(query);
      const movements = await InventoryMovement.find(query)
        .populate('canonicalVariantId', 'title sku')
        .populate('performedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        data: movements,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list inventory movements' },
      });
    }
  }

  // PUT /api/v1/inventory/:variantId/allocations - Set channel allocation policy
  static async setAllocation(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      const { channelConnectionId, allocationType, allocationValue } = req.body;

      const allocation = await InventoryAllocation.findOneAndUpdate(
        {
          organizationId: req.tenantId,
          canonicalVariantId: variantId,
          channelConnectionId,
        },
        {
          $set: {
            allocationType: allocationType || AllocationType.SHARED_POOL,
            allocationValue: allocationValue ?? 100,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        data: allocation,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update channel allocation' },
      });
    }
  }
}
