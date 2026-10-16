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

export class SyncController {
  // GET /api/v1/sync/jobs - List synchronization jobs and status
  static async listJobs(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const total = await SyncJob.countDocuments({ organizationId: req.tenantId });
      const jobs = await SyncJob.find({ organizationId: req.tenantId })
        .populate('channelConnectionId', 'name channelType')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

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
        details: details || {},
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
                  const client = ShopifyService.getClient(domain, token);

                  const shopRes = await client.get('/products.json?limit=250');
                  const products = shopRes.data?.products || [];

                  for (const prod of products) {
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
                      syncedCount++;
                    }
                  }
                  conn.lastSyncAt = new Date();
                  await conn.save();
                  logger.info(`Successfully imported ${syncedCount} Shopify products from ${domain}`);
                } catch (fetchErr: any) {
                  logger.error(`Failed to fetch Shopify products for ${conn.name}: ${fetchErr.message}`);
                }
              }
            }
          }

          // 2. INVENTORY_SYNC: Push platform stock levels to Shopify
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
              }
            }
            logger.info(`Inventory sync finished. Synced ${syncedCount} items.`);
          }

          // 3. PRICE_SYNC: Push platform prices to Shopify
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
              .populate('canonicalVariantId')
              .populate('channelProductId')
              .populate('channelConnectionId');

            for (const mapping of mappings) {
              const conn: any = mapping.channelConnectionId;
              const chProd: any = mapping.channelProductId;
              const variant: any = mapping.canonicalVariantId;

              if (conn?.channelType === ChannelType.SHOPIFY && chProd?.externalVariantId && variant) {
                try {
                  const { domain, token } = ShopifyService.getCredentials(conn);
                  const success = await ShopifyService.updateVariantPrice(
                    domain,
                    token,
                    chProd.externalVariantId,
                    variant.retailPrice
                  );

                  if (success) {
                    chProd.price = variant.retailPrice;
                    chProd.lastSyncedAt = new Date();
                    await chProd.save();
                    syncedCount++;
                  }
                } catch (priceErr: any) {
                  logger.warn(`Failed to sync price for variant ${variant.sku}: ${priceErr.message}`);
                }
              }
            }
            logger.info(`Price sync finished. Synced ${syncedCount} items.`);
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
            connection.lastSyncAt = new Date();
            await connection.save();
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

  // POST /api/v1/sync/import-to-canonical - Import Shopify products directly into Canonical Master Catalog
  static async importToCanonical(req: Request, res: Response) {
    try {
      const { channelConnectionId, forceReimport = false } = req.body;

      const connQuery: any = {
        organizationId: req.tenantId,
        channelType: ChannelType.SHOPIFY,
        status: ChannelStatus.ACTIVE,
      };
      if (channelConnectionId) {
        connQuery._id = channelConnectionId;
      }

      const connections = await ChannelConnection.find(connQuery);
      if (connections.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No active Shopify store connection found' },
        });
      }

      let newlyImportedProductsCount = 0;
      let alreadyImportedProductsCount = 0;
      let newlyImportedVariantsCount = 0;
      let updatedProductsCount = 0;
      let mappedCount = 0;

      for (const conn of connections) {
        // Fetch latest products from Shopify
        try {
          const { domain, token } = ShopifyService.getCredentials(conn);
          const client = ShopifyService.getClient(domain, token);
          const shopRes = await client.get('/products.json?limit=250');
          const prods = shopRes.data?.products || [];

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

        const channelProducts = await ChannelProduct.find({
          organizationId: req.tenantId,
          channelConnectionId: conn._id,
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
          const masterSku = (firstItem.sku || `SH-${extId}`).toUpperCase().trim();

          // Transform images to match CanonicalProduct embedded schema: [{ url, altText, position, isPrimary }]
          const rawImages = rawProd?.images && Array.isArray(rawProd.images) && rawProd.images.length > 0
            ? rawProd.images
            : rawProd?.image
            ? [rawProd.image]
            : [];
          const images = (Array.isArray(rawImages) ? rawImages : [rawImages])
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

          const rawTags = rawProd?.tags || [];
          const tags = Array.isArray(rawTags)
            ? rawTags
            : typeof rawTags === 'string'
            ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : [];

          // Check if CanonicalProduct with masterSku or title already exists
          let canonicalProduct = await CanonicalProduct.findOne({
            organizationId: req.tenantId,
            $or: [{ masterSku }, { title: baseTitle }],
          });

          if (canonicalProduct) {
            alreadyImportedProductsCount++;
            if (forceReimport) {
              canonicalProduct.description = rawProd?.body_html || canonicalProduct.description;
              canonicalProduct.brand = rawProd?.vendor || canonicalProduct.brand;
              canonicalProduct.category = rawProd?.product_type || canonicalProduct.category;
              canonicalProduct.tags = tags.length > 0 ? tags : canonicalProduct.tags;
              if (images.length > 0) canonicalProduct.images = images;
              canonicalProduct.totalVariants = items.length;
              await canonicalProduct.save();
              updatedProductsCount++;
            }
          } else {
            canonicalProduct = await CanonicalProduct.create({
              organizationId: req.tenantId,
              title: baseTitle,
              masterSku,
              description: rawProd?.body_html || '',
              brand: rawProd?.vendor || 'Shopify',
              category: rawProd?.product_type || 'General',
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
            const variantSku = (item.sku || `SH-VAR-${item.externalVariantId}`).toUpperCase().trim();

            let variant = await ProductVariant.findOne({
              organizationId: req.tenantId,
              canonicalProductId: canonicalProduct._id,
              sku: variantSku,
            });

            if (variant) {
              if (forceReimport) {
                variant.retailPrice = item.price || variant.retailPrice;
                await variant.save();

                const invItem = await InventoryItem.findOne({
                  organizationId: req.tenantId,
                  canonicalVariantId: variant._id,
                });
                if (invItem && typeof item.inventoryQuantity === 'number') {
                  const safeStock = Math.max(0, item.inventoryQuantity);
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
                  reason: 'Imported from Shopify catalog',
                  performedBy: req.user?.userId,
                });
              }

              newlyImportedVariantsCount++;
            }

            // Create/update 1:1 ProductMapping
            await ProductMapping.findOneAndUpdate(
              {
                organizationId: req.tenantId,
                channelProductId: item._id,
              },
              {
                canonicalProductId: canonicalProduct._id,
                canonicalVariantId: variant._id,
                channelConnectionId: conn._id,
                channelProductId: item._id,
                channelType: ChannelType.SHOPIFY,
                mappingConfidence: MappingConfidence.EXACT_SKU,
                syncPrice: true,
                syncInventory: true,
                status: MappingStatus.MAPPED,
              },
              { upsert: true, new: true }
            );
            mappedCount++;
          }
        }
      }

      const alreadyImported = newlyImportedProductsCount === 0 && alreadyImportedProductsCount > 0 && !forceReimport;

      logger.info(
        `Import summary: ${newlyImportedProductsCount} new products, ${alreadyImportedProductsCount} already existing, ${newlyImportedVariantsCount} new variants, ${mappedCount} mappings.`
      );

      return res.json({
        success: true,
        data: {
          alreadyImported,
          alreadyImportedCount: alreadyImportedProductsCount,
          importedProductsCount: newlyImportedProductsCount,
          updatedProductsCount,
          importedVariantsCount: newlyImportedVariantsCount,
          mappedCount,
          message: alreadyImported
            ? `Products from your Shopify store are already imported in your Master Catalog (${alreadyImportedProductsCount} products).`
            : forceReimport
            ? `Successfully refreshed and synchronized ${alreadyImportedProductsCount} products from Shopify!`
            : `Successfully imported ${newlyImportedProductsCount} new products (${newlyImportedVariantsCount} variants) from Shopify into your Master Catalog!`,
        },
      });
    } catch (error: any) {
      logger.error('Failed to import Shopify products to master catalog:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to import products to canonical catalog' },
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
}
