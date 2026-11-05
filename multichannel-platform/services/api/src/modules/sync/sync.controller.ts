import axios from 'axios';
import { Request, Response } from 'express';
import {
  SyncJob,
  ChannelConnection,
  ChannelProduct,
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  InventoryMovement,
  ProductMapping,
} from '../../database/models';
import {
  SyncJobType,
  SyncJobStatus,
  ChannelType,
  ChannelStatus,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
  MappingConfidence,
  ProductStatus,
  InventoryChangeType,
} from '@multichannel/shared';
import { decryptSecret } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import { ShopifyService } from '../../services/shopify.service';
import { EbayService } from '../../services/ebay.service';
import { NotificationService } from '../../services/notification.service';

export class SyncController {
  // GET /api/v1/sync/jobs - List synchronization jobs and status
  static async listJobs(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const total = await SyncJob.countDocuments({ organizationId: req.tenantId });
      const rawJobs = await SyncJob.find({ organizationId: req.tenantId })
        .populate('channelConnectionId', 'name channelType')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const jobs = rawJobs.map((job: any) => ({
        ...job,
        targetChannelName:
          job.channelConnectionId?.name ||
          (job.details?.channelName
            ? `${job.details.channelName} (Disconnected)`
            : 'All Connected Stores'),
      }));

      return res.json({
        success: true,
        data: jobs,
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
        error: { message: error.message || 'Failed to list sync jobs' },
      });
    }
  }

  // POST /api/v1/sync/trigger - Trigger synchronization job (Catalog, Inventory, Orders, Reconciliation)
  static async triggerSync(req: Request, res: Response) {
    try {
      const { channelConnectionId, jobType, details } = req.body;

      if (!jobType || !Object.values(SyncJobType).includes(jobType)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Valid jobType is required', code: 'INVALID_JOB_TYPE' },
        });
      }

      let connection = null;
      if (channelConnectionId) {
        connection = await ChannelConnection.findOne({
          _id: channelConnectionId,
          organizationId: req.tenantId,
        });

        if (!connection) {
          return res.status(404).json({
            success: false,
            error: { message: 'Channel connection not found', code: 'CHANNEL_NOT_FOUND' },
          });
        }
      }

      // Create SyncJob record
      const syncJob = await SyncJob.create({
        organizationId: req.tenantId,
        channelConnectionId: connection?._id,
        jobType,
        status: SyncJobStatus.PROCESSING,
        details: {
          ...(details || {}),
          channelName: connection?.name || 'All Connected Stores',
        },
        attemptCount: 1,
      });

      // Execute sync processing asynchronously
      setTimeout(async () => {
        try {
          let syncedCount = 0;

          // 1. CATALOG_IMPORT: Fetch products from Shopify into ChannelProduct
          if (jobType === SyncJobType.CATALOG_IMPORT) {
            const connections = connection
              ? [connection]
              : await ChannelConnection.find({
                  organizationId: req.tenantId,
                  status: ChannelStatus.ACTIVE,
                });

            for (const conn of connections) {
              if (conn.channelType === ChannelType.SHOPIFY) {
                try {
                  const { domain, token } = ShopifyService.getCredentials(conn);
                  const products = await ShopifyService.fetchAllProducts(domain, token);

                  for (const prod of products) {
                    const { mappedCount } = await ShopifyService.ingestShopifyProduct({
                      organizationId: req.tenantId,
                      connection: conn,
                      shopifyProduct: prod,
                    });
                    syncedCount += mappedCount;
                  }

                  // Auto-register webhooks for real-time updates
                  ShopifyService.registerWebhooks(domain, token, conn._id.toString()).catch((e) =>
                    logger.warn(`Could not register webhooks during sync: ${e.message}`)
                  );

                  await ChannelConnection.findByIdAndUpdate(conn._id, {
                    $set: { lastSyncAt: new Date() },
                  }).catch(() => {});
                  logger.info(`Successfully imported ${syncedCount} Shopify products from ${domain}`);

                  if (syncedCount > 0) {
                    await NotificationService.notifyProductImported({
                      organizationId: req.tenantId,
                      channelName: conn.name,
                      channelType: ChannelType.SHOPIFY,
                      count: syncedCount,
                    });
                  }
                } catch (fetchErr: any) {
                  logger.error(`Failed to fetch Shopify products for ${conn.name}: ${fetchErr.message}`);
                }
              } else if (conn.channelType === ChannelType.EBAY) {
                try {
                  const result = await EbayService.syncAllEbayProducts(conn, req.tenantId);
                  syncedCount += result.syncedCount;
                  logger.info(`Successfully imported ${result.syncedCount} eBay products for ${conn.name}`);

                  if (result.syncedCount > 0) {
                    await NotificationService.notifyProductImported({
                      organizationId: req.tenantId,
                      channelName: conn.name,
                      channelType: ChannelType.EBAY,
                      count: result.syncedCount,
                    });
                  }
                } catch (ebayErr: any) {
                  logger.error(`Failed to fetch eBay products for ${conn.name}: ${ebayErr.message}`);
                }
              }
            }
          }

          // 2. INVENTORY_SYNC: Push platform stock levels to external channels
          else if (jobType === SyncJobType.INVENTORY_SYNC) {
            const mappingsQuery: any = {
              organizationId: req.tenantId,
              status: MappingStatus.MAPPED,
              syncInventory: true,
            };
            if (connection) {
              mappingsQuery.channelConnectionId = connection._id;
            }

            const mappings = await ProductMapping.find(mappingsQuery)
              .populate('canonicalVariantId')
              .populate('channelProductId')
              .populate('channelConnectionId');

            for (const mapping of mappings) {
              const conn: any = mapping.channelConnectionId;
              const chProd: any = mapping.channelProductId;
              const variant: any = mapping.canonicalVariantId;

              if (conn?.channelType === ChannelType.SHOPIFY && chProd && variant) {
                try {
                  const { domain, token } = ShopifyService.getCredentials(conn);
                  const invItem = await InventoryItem.findOne({
                    organizationId: req.tenantId,
                    canonicalVariantId: variant._id,
                  });

                  const invItemId = chProd.rawPayload?.variant?.inventory_item_id;
                  if (invItem && invItemId) {
                    const success = await ShopifyService.setInventoryLevel(
                      domain,
                      token,
                      String(invItemId),
                      invItem.availableToAllocate
                    );

                    if (success) {
                      chProd.inventoryQuantity = invItem.availableToAllocate;
                      chProd.lastSyncedAt = new Date();
                      await chProd.save();
                      syncedCount++;
                    }
                  }
                } catch (invErr: any) {
                  logger.warn(`Failed to sync inventory for variant ${variant.sku}: ${invErr.message}`);
                }
              } else if (conn?.channelType === ChannelType.EBAY && chProd && variant) {
                try {
                  const { host, token } = await EbayService.getValidCredentials(conn);
                  const invItem = await InventoryItem.findOne({
                    organizationId: req.tenantId,
                    canonicalVariantId: variant._id,
                  });
                  if (invItem && chProd.sku) {
                    const existingListingId = chProd.externalListingId || (chProd.externalProductId && /^\d+$/.test(chProd.externalProductId) ? chProd.externalProductId : undefined);
                    const setResult = await EbayService.setInventoryItem(host, token, chProd.sku, {
                      title: chProd.title,
                      quantity: invItem.availableToAllocate,
                      price: variant.retailPrice,
                      listingId: existingListingId,
                    });
                    if (setResult?.success) {
                      chProd.inventoryQuantity = invItem.availableToAllocate;
                      chProd.lastSyncedAt = new Date();
                      if (setResult.listingId) {
                        chProd.externalListingId = setResult.listingId;
                      }
                      await chProd.save();
                      syncedCount++;
                    }
                  }
                } catch (ebayInvErr: any) {
                  logger.warn(`Failed to sync eBay inventory for SKU ${chProd.sku}: ${ebayInvErr.message}`);
                }
              }
            }
            logger.info(`Inventory sync finished. Synced ${syncedCount} items.`);
          }

          // 3. PRICE_SYNC: Push platform prices to external channels
          else if (jobType === SyncJobType.PRICE_SYNC) {
            const mappingsQuery: any = {
              organizationId: req.tenantId,
              status: MappingStatus.MAPPED,
              syncPrice: true,
            };
            if (connection) {
              mappingsQuery.channelConnectionId = connection._id;
            }

            const mappings = await ProductMapping.find(mappingsQuery)
              .populate('canonicalProductId')
              .populate('canonicalVariantId')
              .populate('channelProductId')
              .populate('channelConnectionId');

            for (const mapping of mappings) {
              const conn: any = mapping.channelConnectionId;
              const chProd: any = mapping.channelProductId;
              const variant: any = mapping.canonicalVariantId;
              const prod: any = mapping.canonicalProductId;

              const defaultFee = conn?.channelType === ChannelType.EBAY
                ? 15
                : (conn?.channelType === ChannelType.SHOPIFY ? 5 : 10);
              const feePercent = typeof conn?.config?.markupPercent === 'number'
                ? conn.config.markupPercent
                : defaultFee;

              const basePrice = typeof variant?.retailPrice === 'number' && variant.retailPrice > 0
                ? variant.retailPrice
                : (typeof prod?.defaultRetailPrice === 'number' && prod.defaultRetailPrice > 0 ? prod.defaultRetailPrice : 0);
              const shipCharge = (typeof variant?.shippingCharge === 'number' && variant.shippingCharge > 0)
                ? variant.shippingCharge
                : (typeof prod?.shippingCharge === 'number' && prod.shippingCharge > 0 ? prod.shippingCharge : 0);
              const combinedPrice = basePrice + shipCharge;
              const computedPrice = feePercent > 0
                ? Math.round(combinedPrice * (1 + feePercent / 100) * 100) / 100
                : combinedPrice;
              const finalPrice = Math.max(conn?.channelType === ChannelType.EBAY ? 0.99 : 0.01, Number(computedPrice.toFixed(2)));

              if (conn?.channelType === ChannelType.SHOPIFY && chProd?.externalVariantId && variant) {
                try {
                  const { domain, token } = ShopifyService.getCredentials(conn);

                  const success = await ShopifyService.updateVariantPrice(
                    domain,
                    token,
                    chProd.externalVariantId,
                    finalPrice
                  );

                  if (success) {
                    chProd.price = finalPrice;
                    chProd.lastSyncedAt = new Date();
                    await chProd.save();
                    syncedCount++;
                  }
                } catch (priceErr: any) {
                  logger.warn(`Failed to sync price for variant ${variant.sku}: ${priceErr.message}`);
                }
              } else if (conn?.channelType === ChannelType.EBAY && chProd?.sku && variant) {
                try {
                  const { host, token } = await EbayService.getValidCredentials(conn);
                  const existingListingId = chProd.externalListingId || (chProd.externalProductId && /^\d+$/.test(chProd.externalProductId) ? chProd.externalProductId : undefined);
                  const setResult = await EbayService.setInventoryItem(host, token, chProd.sku, {
                    title: chProd.title,
                    quantity: chProd.inventoryQuantity || 0,
                    price: finalPrice,
                    listingId: existingListingId,
                  });
                  if (setResult?.success) {
                    chProd.price = finalPrice;
                    chProd.lastSyncedAt = new Date();
                    if (setResult.listingId) {
                      chProd.externalListingId = setResult.listingId;
                    }
                    await chProd.save();
                    syncedCount++;
                  }
                } catch (ebayPriceErr: any) {
                  logger.warn(`Failed to sync eBay price for SKU ${chProd.sku}: ${ebayPriceErr.message}`);
                }
              } else if ((conn?.channelType === ChannelType.CUSTOM_STORE || String(conn?.channelType).toUpperCase().includes('CUSTOM')) && chProd) {
                chProd.price = finalPrice;
                chProd.lastSyncedAt = new Date();
                await chProd.save();
                syncedCount++;
              }
            }
            logger.info(`Price sync finished. Synced ${syncedCount} items.`);
          }

          // 4. RECONCILIATION: Check mapped items against eBay live status and resolve discrepancies
          else if (jobType === SyncJobType.RECONCILIATION) {
            const connections = connection
              ? [connection]
              : await ChannelConnection.find({
                  organizationId: req.tenantId,
                  status: ChannelStatus.ACTIVE,
                });

            for (const conn of connections) {
              if (conn.channelType === ChannelType.EBAY) {
                try {
                  const reconResult = await EbayService.reconcileEbaySync(req.tenantId, conn);
                  syncedCount += reconResult.verifiedCount + reconResult.newlyIngestedCount;
                  logger.info(
                    `Reconciliation finished for ${conn.name}: ${reconResult.verifiedCount} verified, ${reconResult.discrepanciesResolvedCount} discrepancies resolved, ${reconResult.newlyIngestedCount} ingested.`
                  );
                } catch (reconErr: any) {
                  logger.error(`Reconciliation error for ${conn.name}: ${reconErr.message}`);
                }
              }
            }
          }

          syncJob.status = SyncJobStatus.COMPLETED;
          syncJob.finishedAt = new Date();
          syncJob.details = {
            ...syncJob.details,
            message: `Synchronized ${syncedCount} items for ${jobType}`,
            syncedItems: syncedCount,
          };
          await syncJob.save();

          if (connection) {
            await ChannelConnection.findByIdAndUpdate(connection._id, {
              $set: { lastSyncAt: new Date() },
            }).catch(() => {});
          }
        } catch (e: any) {
          logger.error('Background sync job error:', e);
          syncJob.status = SyncJobStatus.FAILED;
          syncJob.errorMessage = e.message;
          await syncJob.save();
        }
      }, 300);

      logger.info(`Sync job dispatched: ${jobType} (Job: ${syncJob._id})`);

      return res.status(202).json({
        success: true,
        data: syncJob,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to trigger sync' },
      });
    }
  }

  // POST /api/v1/sync/import-to-canonical - Import products from external channels directly into Canonical Master Catalog
  static async importToCanonical(req: Request, res: Response) {
    try {
      const { channelConnectionId, forceReimport = false } = req.body;

      const connQuery: any = {
        organizationId: req.tenantId,
        status: ChannelStatus.ACTIVE,
      };
      if (channelConnectionId) {
        connQuery._id = channelConnectionId;
      }

      const connections = await ChannelConnection.find(connQuery);
      if (connections.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No active channel connection found' },
        });
      }

      let newlyImportedProductsCount = 0;
      let alreadyImportedProductsCount = 0;
      let newlyImportedVariantsCount = 0;
      let updatedProductsCount = 0;
      let mappedCount = 0;

      for (const conn of connections) {
        // Fetch latest products from channel
        if (conn.channelType === ChannelType.SHOPIFY) {
          try {
            const { domain, token } = ShopifyService.getCredentials(conn);
            const prods = await ShopifyService.fetchAllProducts(domain, token);

            // Auto-ensure webhooks are registered to deliver updates
            ShopifyService.registerWebhooks(domain, token, conn._id.toString()).catch((e) =>
              logger.warn(`Could not register webhooks during importToCanonical: ${e.message}`)
            );

            for (const prod of prods) {
              for (const variant of prod.variants || []) {
                await ChannelProduct.findOneAndUpdate(
                  {
                    organizationId: req.tenantId,
                    channelConnectionId: conn._id,
                    externalProductId: String(prod.id),
                    externalVariantId: String(variant.id),
                  },
                  {
                    channelType: ChannelType.SHOPIFY,
                    title: prod.title + (variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
                    sku: (variant.sku && variant.sku.trim()) || `SHOPIFY-${variant.id}`,
                    barcode: variant.barcode || '',
                    price: parseFloat(variant.price) || 0,
                    inventoryQuantity: variant.inventory_quantity || 0,
                    status: ChannelProductStatus.ACTIVE,
                    syncStatus: SyncStatus.SYNCED,
                    lastSyncedAt: new Date(),
                    rawPayload: { product: prod, variant },
                  },
                  { upsert: true, new: true }
                );
              }
            }
          } catch (fetchErr: any) {
            logger.warn(`Could not refresh Shopify channel catalog directly: ${fetchErr.message}`);
          }
        } else if (conn.channelType === ChannelType.EBAY) {
          try {
            const { host, token } = await EbayService.getValidCredentials(conn);
            const items = await EbayService.getInventoryItems(host, token, 100, conn);
            const activeSkus = new Set<string>();
            const activeListingIds = new Set<string>();

            for (const item of items) {
              const sku = (item.sku || '').trim();
              const listingId = String(item.listingId || item.sku || '').trim();
              const cleanSku = (sku || (listingId ? `EBAY-${listingId}` : `EBAY-ITEM-${Date.now()}`)).toUpperCase().trim();
              if (cleanSku) activeSkus.add(cleanSku);
              if (listingId) activeListingIds.add(listingId);

              await ChannelProduct.findOneAndUpdate(
                {
                  organizationId: req.tenantId,
                  channelConnectionId: conn._id,
                  $or: [{ sku: cleanSku }, ...(listingId ? [{ externalProductId: listingId }] : [])],
                },
                {
                  channelType: ChannelType.EBAY,
                  externalProductId: listingId || cleanSku,
                  externalVariantId: cleanSku,
                  externalListingId: listingId || undefined,
                  title: item.title,
                  sku: cleanSku,
                  barcode: '',
                  price: item.price || 0,
                  inventoryQuantity: item.quantity || 0,
                  status: ChannelProductStatus.ACTIVE,
                  syncStatus: SyncStatus.SYNCED,
                  lastSyncedAt: new Date(),
                  rawPayload: {
                    ebayItem: item.raw,
                    images: item.images,
                    description: item.description,
                    listingId,
                    offerId: item.offerId,
                  },
                },
                { upsert: true, new: true }
              );
            }

            // Reconcile ended/deleted eBay listings
            const existingChannelProds = await ChannelProduct.find({
              organizationId: req.tenantId,
              channelConnectionId: conn._id,
              status: { $in: [ChannelProductStatus.ACTIVE, ChannelProductStatus.DRAFT] },
            });

            for (const cp of existingChannelProds) {
              const cpSku = (cp.sku || '').toUpperCase().trim();
              const cpListingId = String(cp.externalListingId || cp.externalProductId || '').trim();
              const isStillActive =
                (cpSku && activeSkus.has(cpSku)) ||
                (cpListingId && activeListingIds.has(cpListingId));

              if (!isStillActive) {
                cp.status = ChannelProductStatus.ENDED;
                cp.syncStatus = SyncStatus.OUT_OF_SYNC;
                await cp.save();

                await ProductMapping.updateMany(
                  {
                    organizationId: req.tenantId,
                    channelProductId: cp._id,
                    status: MappingStatus.MAPPED,
                  },
                  {
                    $set: {
                      status: MappingStatus.UNMAPPED,
                      unmappedAt: new Date(),
                      unmappedReason: 'Listing ended or removed from eBay store',
                    },
                  }
                );
              }
            }
          } catch (fetchErr: any) {
            logger.warn(`Could not refresh eBay channel catalog directly: ${fetchErr.message}`);
          }
        }

        const channelProducts = await ChannelProduct.find({
          organizationId: req.tenantId,
          channelConnectionId: conn._id,
          status: { $nin: [ChannelProductStatus.ENDED, ChannelProductStatus.UNPUBLISHED] },
        });

        // Group channel products by externalProductId
        const productMap = new Map<string, any[]>();
        for (const cp of channelProducts) {
          const extId = cp.externalProductId || String(cp._id);
          if (!productMap.has(extId)) {
            productMap.set(extId, []);
          }
          productMap.get(extId)!.push(cp);
        }

        for (const [extId, items] of productMap.entries()) {
          const firstItem = items[0];
          const rawProd = firstItem.rawPayload?.product;

          const baseTitle = rawProd?.title || firstItem.title.split(' - ')[0] || firstItem.title;
          const prefix = conn.channelType === ChannelType.EBAY ? 'EBAY' : 'SH';
          const masterSku = (firstItem.sku || `${prefix}-${extId}`).toUpperCase().trim();

          // Transform images to match CanonicalProduct embedded schema: [{ url, altText, position, isPrimary }]
          let images: any[] = [];
          if (conn.channelType === ChannelType.EBAY) {
            const rawImgUrls = firstItem.rawPayload?.images || [];
            images = rawImgUrls.map((url: string, idx: number) => ({
              url,
              altText: baseTitle,
              position: idx,
              isPrimary: idx === 0,
            })).filter((img: any) => img.url && typeof img.url === 'string' && img.url.trim().length > 0);
          } else {
            const rawImages = rawProd?.images && Array.isArray(rawProd.images) && rawProd.images.length > 0
              ? rawProd.images
              : rawProd?.image
              ? [rawProd.image]
              : [];
            images = (Array.isArray(rawImages) ? rawImages : [rawImages])
              .map((img: any, idx: number) => {
                const url = typeof img === 'string' ? img : img?.src || img?.url || '';
                return {
                  url,
                  altText: typeof img === 'object' ? img?.alt || '' : '',
                  position: typeof img === 'object' && typeof img?.position === 'number' ? img.position : idx,
                  isPrimary: idx === 0,
                };
              })
              .filter((img: any) => img.url && typeof img.url === 'string' && img.url.trim().length > 0);
          }

          const rawTags = rawProd?.tags || [];
          const tags = Array.isArray(rawTags)
            ? rawTags
            : typeof rawTags === 'string'
            ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];

          const description = conn.channelType === ChannelType.EBAY
            ? (firstItem.rawPayload?.description || '')
            : (rawProd?.body_html || '');
          const brand = conn.channelType === ChannelType.EBAY
            ? 'eBay'
            : (rawProd?.vendor || 'Shopify');
          const category = conn.channelType === ChannelType.EBAY
            ? 'General'
            : (rawProd?.product_type || 'General');

          // 1. Try finding existing CanonicalProduct by ProductMapping
          let canonicalProduct: any = null;
          const existingMapping = await ProductMapping.findOne({
            organizationId: req.tenantId,
            channelProductId: firstItem._id,
          });
          if (existingMapping?.canonicalProductId) {
            canonicalProduct = await CanonicalProduct.findOne({
              _id: existingMapping.canonicalProductId,
              organizationId: req.tenantId,
            });
          }

          // 2. Try finding by variant SKU
          if (!canonicalProduct && firstItem.sku) {
            const existingVar = await ProductVariant.findOne({
              organizationId: req.tenantId,
              sku: firstItem.sku.toUpperCase().trim(),
            });
            if (existingVar) {
              canonicalProduct = await CanonicalProduct.findOne({
                _id: existingVar.canonicalProductId,
                organizationId: req.tenantId,
              });
            }
          }

          // 3. Try finding by masterSku or title
          if (!canonicalProduct) {
            canonicalProduct = await CanonicalProduct.findOne({
              organizationId: req.tenantId,
              $or: [{ masterSku }, { title: baseTitle }],
            });
          }

          if (canonicalProduct) {
            alreadyImportedProductsCount++;
            let hasProductChanged = false;
            if (baseTitle && canonicalProduct.title !== baseTitle) {
              canonicalProduct.title = baseTitle;
              hasProductChanged = true;
            }
            if (description && canonicalProduct.description !== description) {
              canonicalProduct.description = description;
              hasProductChanged = true;
            }
            if (brand && canonicalProduct.brand !== brand) {
              canonicalProduct.brand = brand;
              hasProductChanged = true;
            }
            if (category && canonicalProduct.category !== category) {
              canonicalProduct.category = category;
              hasProductChanged = true;
            }
            if (tags.length > 0) {
              canonicalProduct.tags = tags;
              hasProductChanged = true;
            }
            if (images.length > 0) {
              canonicalProduct.images = images;
              hasProductChanged = true;
            }
            // Preserve Master Base Retail Price. Do not overwrite existing platform base price with store marked-up price.
            if ((!canonicalProduct.defaultRetailPrice || canonicalProduct.defaultRetailPrice <= 0) && firstItem.price !== undefined && firstItem.price > 0) {
              canonicalProduct.defaultRetailPrice = firstItem.price;
              hasProductChanged = true;
            }
            if (canonicalProduct.totalVariants !== items.length) {
              canonicalProduct.totalVariants = items.length;
              hasProductChanged = true;
            }
            if (hasProductChanged || forceReimport) {
              await canonicalProduct.save();
              updatedProductsCount++;
            }
          } else {
            canonicalProduct = await CanonicalProduct.create({
              organizationId: req.tenantId,
              title: baseTitle,
              masterSku,
              description,
              brand,
              category,
              tags,
              images,
              defaultCostPrice: 0,
              defaultRetailPrice: firstItem.price || 0,
              totalVariants: items.length,
              status: ProductStatus.ACTIVE,
            });
            newlyImportedProductsCount++;
          }

          // Process variants for this product
          for (const item of items) {
            const variantSku = (item.sku || `${prefix}-VAR-${item.externalVariantId || item.externalProductId}`).toUpperCase().trim();

            let variant = await ProductVariant.findOne({
              organizationId: req.tenantId,
              canonicalProductId: canonicalProduct._id,
              sku: variantSku,
            });

            if (!variant && item._id) {
              const varMap = await ProductMapping.findOne({
                organizationId: req.tenantId,
                channelProductId: item._id,
              });
              if (varMap?.canonicalVariantId) {
                variant = await ProductVariant.findOne({
                  _id: varMap.canonicalVariantId,
                  organizationId: req.tenantId,
                });
              }
            }

            if (variant) {
              let hasVarChanged = false;
              const rawVar = item.rawPayload?.variant;
              const varTitle = rawVar?.title && rawVar.title !== 'Default Title' ? rawVar.title : item.title;
              if (varTitle && variant.title !== varTitle) {
                variant.title = varTitle;
                hasVarChanged = true;
              }
              // Preserve Variant Base Retail Price. Do not overwrite existing platform base price with store marked-up price.
              if ((!variant.retailPrice || variant.retailPrice <= 0) && item.price !== undefined && item.price > 0) {
                variant.retailPrice = item.price;
                hasVarChanged = true;
              }
              if (item.barcode && variant.barcode !== item.barcode) {
                variant.barcode = item.barcode;
                hasVarChanged = true;
              }
              if (hasVarChanged || forceReimport) {
                await variant.save();
              }

              const invItem = await InventoryItem.findOne({
                organizationId: req.tenantId,
                canonicalVariantId: variant._id,
              });
              if (invItem && typeof item.inventoryQuantity === 'number') {
                const safeStock = Math.max(0, item.inventoryQuantity);
                if (invItem.trackedStock !== safeStock || forceReimport) {
                  invItem.trackedStock = safeStock;
                  invItem.availableToAllocate = Math.max(
                    0,
                    safeStock - invItem.reservedStock - invItem.safetyStock
                  );
                  await invItem.save();
                }
              }
            } else {
              const rawVar = item.rawPayload?.variant;
              const varTitle = rawVar?.title && rawVar.title !== 'Default Title' ? rawVar.title : item.title;

              variant = await ProductVariant.create({
                organizationId: req.tenantId,
                canonicalProductId: canonicalProduct._id,
                sku: variantSku,
                barcode: item.barcode || undefined,
                title: varTitle,
                costPrice: 0,
                retailPrice: item.price || 0,
                compareAtPrice: rawVar?.compare_at_price ? parseFloat(rawVar.compare_at_price) : undefined,
                weight: rawVar?.weight || 0,
                weightUnit: rawVar?.weight_unit || 'lb',
              });

              // Create inventory record (clamping at 0 to avoid negative inventory validation errors)
              const stock = Math.max(0, item.inventoryQuantity || 0);
              await InventoryItem.create({
                organizationId: req.tenantId,
                canonicalVariantId: variant._id,
                sku: variant.sku,
                trackedStock: stock,
                reservedStock: 0,
                safetyStock: 0,
                availableToAllocate: stock,
                lowStockThreshold: 5,
              });

              if (stock > 0) {
                await InventoryMovement.create({
                  organizationId: req.tenantId,
                  canonicalVariantId: variant._id,
                  changeType: InventoryChangeType.RESTOCK,
                  quantityChanged: stock,
                  previousTrackedStock: 0,
                  newTrackedStock: stock,
                  reason: `Imported from ${conn.name} (${conn.channelType}) catalog`,
                  performedBy: req.user?.userId,
                });
              }

              newlyImportedVariantsCount++;
            }

            // Safely establish unique 1:1 ProductMapping without duplicate key collisions
            try {
              let existingMapping = await ProductMapping.findOne({
                organizationId: req.tenantId,
                $or: [
                  { channelProductId: item._id },
                  { canonicalVariantId: variant._id, channelConnectionId: conn._id },
                ],
              });

              if (existingMapping) {
                existingMapping.canonicalProductId = canonicalProduct._id;
                existingMapping.canonicalVariantId = variant._id;
                existingMapping.channelConnectionId = conn._id;
                existingMapping.channelProductId = item._id;
                existingMapping.channelType = conn.channelType;
                existingMapping.mappingConfidence = MappingConfidence.EXACT_SKU;
                existingMapping.syncPrice = true;
                existingMapping.syncInventory = true;
                existingMapping.status = MappingStatus.MAPPED;
                existingMapping.updatedAt = new Date();
                existingMapping.unmappedAt = undefined;
                existingMapping.unmappedReason = undefined;
                await existingMapping.save();
              } else {
                await ProductMapping.findOneAndUpdate(
                  {
                    organizationId: req.tenantId,
                    canonicalVariantId: variant._id,
                    channelConnectionId: conn._id,
                  },
                  {
                    $set: {
                      canonicalProductId: canonicalProduct._id,
                      channelProductId: item._id,
                      channelType: conn.channelType,
                      mappingConfidence: MappingConfidence.EXACT_SKU,
                      syncPrice: true,
                      syncInventory: true,
                      status: MappingStatus.MAPPED,
                      updatedAt: new Date(),
                    },
                    $unset: { unmappedAt: 1, unmappedReason: 1 },
                  },
                  { upsert: true, new: true }
                );
              }
              mappedCount++;
            } catch (mapErr: any) {
              logger.warn(`Could not establish mapping for channel product ${item._id}: ${mapErr.message}`);
            }
          }
        }
      }

      const channelLabel = connections.length === 1 ? `${connections[0].name} (${connections[0].channelType})` : 'your connected stores';
      const alreadyImported = newlyImportedProductsCount === 0 && alreadyImportedProductsCount > 0 && !forceReimport && updatedProductsCount === 0;

      logger.info(
        `Import summary for ${channelLabel}: ${newlyImportedProductsCount} new products, ${alreadyImportedProductsCount} already existing, ${updatedProductsCount} updated products, ${newlyImportedVariantsCount} new variants, ${mappedCount} mappings.`
      );

      let responseMessage = '';
      if (newlyImportedProductsCount > 0) {
        responseMessage = `Successfully imported ${newlyImportedProductsCount} new products (${newlyImportedVariantsCount} variants) from ${channelLabel} into Master Catalog!`;
      } else if (updatedProductsCount > 0) {
        responseMessage = `Successfully synchronized ${updatedProductsCount} products with latest prices and stock from ${channelLabel}!`;
      } else {
        responseMessage = `All products from ${channelLabel} are already imported and up-to-date in the Master Catalog (${alreadyImportedProductsCount} products).`;
      }

      return res.json({
        success: true,
        data: {
          alreadyImported,
          alreadyImportedCount: alreadyImportedProductsCount,
          importedProductsCount: newlyImportedProductsCount,
          updatedProductsCount,
          importedVariantsCount: newlyImportedVariantsCount,
          mappedCount,
          channelName: connections.length === 1 ? connections[0].name : 'All Channels',
          channelType: connections.length === 1 ? connections[0].channelType : undefined,
          message: responseMessage,
        },
      });
    } catch (error: any) {
      logger.error('Failed to import products to master catalog:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to import products to canonical catalog' },
      });
    }
  }


  // DELETE /api/v1/sync/jobs - Clear completed or failed sync jobs
  static async clearJobs(req: Request, res: Response) {
    try {
      const { status } = req.query;
      const filter: any = { organizationId: req.tenantId };
      if (status) {
        filter.status = (status as string).toUpperCase();
      } else {
        filter.status = { $in: [SyncJobStatus.COMPLETED, SyncJobStatus.FAILED] };
      }

      const result = await SyncJob.deleteMany(filter);
      return res.json({
        success: true,
        data: {
          deletedCount: result.deletedCount,
          message: `Cleared ${result.deletedCount} sync jobs from history.`,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to clear sync jobs' },
      });
    }
  }

  // POST /api/v1/sync/jobs/:id/retry - Retry a failed sync job
  static async retryJob(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const job = await SyncJob.findOne({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: { message: 'Sync job not found', code: 'NOT_FOUND' },
        });
      }

      job.status = SyncJobStatus.QUEUED;
      job.attemptCount += 1;
      job.errorMessage = undefined;
      await job.save();

      return res.json({
        success: true,
        data: job,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to retry sync job' },
      });
    }
  }


  // POST /api/v1/sync/reconcile-ebay - Verify mapped items exist on eBay and resolve discrepancies automatically
  static async reconcileEbay(req: Request, res: Response) {
    try {
      const { channelConnectionId } = req.body;
      const connQuery: any = {
        organizationId: req.tenantId,
        channelType: ChannelType.EBAY,
        status: ChannelStatus.ACTIVE,
      };
      if (channelConnectionId) {
        connQuery._id = channelConnectionId;
      }

      const connections = await ChannelConnection.find(connQuery);
      if (connections.length === 0) {
        return res.status(404).json({
          success: false,
          error: { message: 'No active eBay channel connection found', code: 'NO_EBAY_CONNECTION' },
        });
      }

      const allResults: any[] = [];
      for (const conn of connections) {
        const result = await EbayService.reconcileEbaySync(req.tenantId, conn);
        allResults.push({
          channelConnectionId: conn._id,
          channelName: conn.name,
          ...result,
        });
      }

      return res.json({
        success: true,
        data: {
          results: allResults,
          message: `Reconciliation check completed for ${connections.length} eBay connection(s).`,
        },
      });
    } catch (error: any) {
      logger.error('Failed to run eBay reconciliation:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to run eBay reconciliation' },



      });
    }
  }
}
