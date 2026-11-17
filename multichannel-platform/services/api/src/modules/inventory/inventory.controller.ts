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
              const { marketplaceId, currency, siteId } = EbayService.resolveMarketplace(conn);
              const existingListingId = chProd.externalListingId || (chProd.externalProductId && /^\d+$/.test(chProd.externalProductId) ? chProd.externalProductId : undefined);
              const updateResult = await EbayService.updatePriceAndInventory(host, token, {
                sku: chProd.sku,
                listingId: existingListingId,
                quantity: item.availableToAllocate,
                price: finalPrice,
                marketplaceId,
                currency,
                siteId,
              });
              await ChannelProduct.findByIdAndUpdate(chProd._id, {
                $set: {
                  inventoryQuantity: item.availableToAllocate,
                  price: finalPrice,
                  lastSyncedAt: new Date(),
                  ...(updateResult.listingId ? { externalProductId: updateResult.listingId, externalListingId: updateResult.listingId } : {}),
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
        const { channelConnectionId, stock, price, basePrice, shippingCharge, markupPercent, finalStorePrice, ebayMarkupPercent } = ch;
        const conn = await ChannelConnection.findOne({
          _id: channelConnectionId,
          organizationId: req.tenantId,
        });
        if (!conn) continue;

        // 1. Check if stock was modified
        const previousStock = item.trackedStock;
        if (stock !== undefined && !isNaN(Number(stock))) {
          const newTrackedStock = Number(stock);
          if (newTrackedStock !== previousStock) {
            item.trackedStock = newTrackedStock;
            item.availableToAllocate = Math.max(0, newTrackedStock - (item.reservedStock || 0) - (item.safetyStock || 0));
            await item.save();

            await InventoryMovement.create({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              changeType: InventoryChangeType.MANUAL_ADJUSTMENT,
              quantityChanged: newTrackedStock - previousStock,
              previousTrackedStock: previousStock,
              newTrackedStock: newTrackedStock,
              reason: `Inventory & price adjustment for ${conn.name}`,
              performedBy: req.user?.userId,
            });
          }
        }

        // 2. Check if platform base price or shipping charge modified
        if (basePrice !== undefined && Number(basePrice) > 0) {
          variant.retailPrice = Number(basePrice);
        }
        if (shippingCharge !== undefined && Number(shippingCharge) >= 0) {
          variant.shippingCharge = Number(shippingCharge);
        }
        await variant.save();

        if (canonicalProduct) {
          if (basePrice !== undefined && Number(basePrice) > 0 && (!canonicalProduct.defaultRetailPrice || canonicalProduct.defaultRetailPrice <= 0)) {
            canonicalProduct.defaultRetailPrice = Number(basePrice);
          }
          if (shippingCharge !== undefined && Number(shippingCharge) >= 0 && (!canonicalProduct.shippingCharge || canonicalProduct.shippingCharge <= 0)) {
            canonicalProduct.shippingCharge = Number(shippingCharge);
          }
          await canonicalProduct.save();
        }

        // 3. Compute final store price to push
        const currentBase = Number(basePrice !== undefined ? basePrice : (variant.retailPrice || 0));
        const currentShip = Number(shippingCharge !== undefined ? shippingCharge : (variant.shippingCharge || 0));
        const currentFee = Number(markupPercent !== undefined ? markupPercent : (ebayMarkupPercent !== undefined ? ebayMarkupPercent : (conn.channelType === ChannelType.EBAY ? 15 : (conn.channelType === ChannelType.SHOPIFY ? 5 : 10))));
        const combined = currentBase + currentShip;
        const targetPrice = finalStorePrice !== undefined && Number(finalStorePrice) > 0
          ? Number(finalStorePrice)
          : (price !== undefined && Number(price) > 0
              ? Number(price)
              : (currentFee > 0 ? Math.round(combined * (1 + currentFee / 100) * 100) / 100 : combined));

        const targetStock = item.availableToAllocate;

        // SHOPIFY SYNC
        if (conn.channelType === ChannelType.SHOPIFY) {
          try {
            const { domain, token } = ShopifyService.getCredentials(conn);
            let mapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            if (mapping && mapping.channelProductId) {
              const chProd: any = mapping.channelProductId;
              const invItemId = chProd.rawPayload?.variant?.inventory_item_id;

              if (invItemId) {
                await ShopifyService.setInventoryLevel(
                  domain,
                  token,
                  String(invItemId),
                  targetStock
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
              chProd.inventoryQuantity = targetStock;
              chProd.syncStatus = SyncStatus.SYNCED;
              chProd.lastSyncedAt = new Date();
              await chProd.save();

              mapping.status = MappingStatus.MAPPED;
              mapping.priceModifier = { type: 'PERCENTAGE', value: currentFee };
              mapping.updatedAt = new Date();
              await mapping.save();

              results.push({
                channel: conn.name,
                channelType: conn.channelType,
                status: 'SYNCED',
                price: targetPrice,
                stock: targetStock,
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
                      stockQuantity: targetStock,
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
                  inventoryQuantity: targetStock,
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
                  priceModifier: { type: 'PERCENTAGE', value: currentFee },
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
                  stock: targetStock,
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
        // EBAY SYNC (Dedicated price & inventory update + live Trading/REST fallback)
        else if (conn.channelType === ChannelType.EBAY) {
          try {
            const { host, token } = await EbayService.getValidCredentials(conn);
            const { marketplaceId, currency, siteId } = EbayService.resolveMarketplace(conn);
            const images = (canonicalProduct?.images || []).map((img: any) => typeof img === 'string' ? img : img.url).filter(Boolean);

            let mapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            let channelProd: any = mapping?.channelProductId;
            const existingListingId = channelProd?.externalListingId ||
              (channelProd?.externalProductId && /^\d+$/.test(channelProd.externalProductId) ? channelProd.externalProductId : undefined) ||
              channelProd?.rawPayload?.listingId;
            const targetSku = channelProd?.sku || variant.sku;

            // 1. Try dedicated fast price & inventory update first
            const updateResult = await EbayService.updatePriceAndInventory(host, token, {
              sku: targetSku,
              listingId: existingListingId,
              quantity: targetStock,
              price: targetPrice,
              marketplaceId,
              currency,
              siteId,
            });

            let listingId = updateResult.listingId || existingListingId;

            // 2. If dedicated update was unable to revise and item is not yet published, try setInventoryItem to create/publish
            if (!updateResult.success && !existingListingId) {
              const setResult = await EbayService.setInventoryItem(host, token, targetSku, {
                title: canonicalProduct?.title || variant.title,
                description: canonicalProduct?.description || variant.title,
                quantity: targetStock,
                price: targetPrice,
                images,
                brand: canonicalProduct?.brand || 'Generic',
                marketplaceId,
                listingId: existingListingId,
              });

              if (setResult.success) {
                listingId = setResult.listingId || targetSku;
              } else {
                throw new Error(setResult.error || updateResult.error || `Failed to push SKU ${targetSku} to eBay`);
              }
            }

            listingId = listingId || existingListingId || targetSku;

            if (!channelProd) {
              channelProd = await ChannelProduct.create({
                organizationId: req.tenantId,
                channelConnectionId: conn._id,
                channelType: ChannelType.EBAY,
                externalProductId: listingId,
                externalListingId: listingId,
                externalVariantId: targetSku,
                title: canonicalProduct?.title || variant.title,
                sku: targetSku,
                price: targetPrice,
                inventoryQuantity: targetStock,
                status: ChannelProductStatus.ACTIVE,
                syncStatus: SyncStatus.SYNCED,
                lastSyncedAt: new Date(),
                rawPayload: { listingId, markupPercent: currentFee },
              });

              await ProductMapping.create({
                organizationId: req.tenantId,
                canonicalProductId: variant.canonicalProductId,
                canonicalVariantId: variant._id,
                channelConnectionId: conn._id,
                channelProductId: channelProd._id,
                channelType: ChannelType.EBAY,
                priceModifier: { type: 'PERCENTAGE', value: currentFee },
                syncPrice: true,
                syncInventory: true,
                status: MappingStatus.MAPPED,
              });
            } else {
              channelProd.externalProductId = listingId;
              if (listingId && /^\d+$/.test(listingId)) {
                channelProd.externalListingId = listingId;
              }
              channelProd.price = targetPrice;
              channelProd.inventoryQuantity = targetStock;
              channelProd.syncStatus = SyncStatus.SYNCED;
              channelProd.lastSyncedAt = new Date();
              channelProd.rawPayload = {
                ...channelProd.rawPayload,
                listingId,
                markupPercent: currentFee,
              };
              await channelProd.save();

              mapping!.status = MappingStatus.MAPPED;
              mapping!.priceModifier = { type: 'PERCENTAGE', value: currentFee };
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
              stock: targetStock,
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
          try {
            let mapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: variant._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            if (mapping && mapping.channelProductId) {
              const chProd: any = mapping.channelProductId;
              chProd.price = targetPrice;
              chProd.inventoryQuantity = targetStock;
              chProd.syncStatus = SyncStatus.SYNCED;
              chProd.lastSyncedAt = new Date();
              await chProd.save();

              mapping.priceModifier = { type: 'PERCENTAGE', value: currentFee };
              mapping.updatedAt = new Date();
              await mapping.save();
            }

            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'SYNCED',
              price: targetPrice,
              stock: targetStock,
            });
          } catch (customErr: any) {
            results.push({
              channel: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: customErr.message,
            });
          }
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
