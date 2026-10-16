import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  InventoryMovement,
  ProductCostHistory,
  ProductMapping,
  ChannelProduct,
  ChannelConnection,
} from '../../database/models';
import {
  ProductStatus,
  InventoryChangeType,
  MappingConfidence,
  ChannelType,
  ChannelStatus,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
} from '@multichannel/shared';
import { runInTransaction } from '../../database';
import { logger } from '../../utils/logger';
import { ShopifyService } from '../../services/shopify.service';
import { EbayService } from '../../services/ebay.service';

export class ProductsController {
  // GET /api/v1/products - List canonical products with pagination, search, and variant count
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || '';
      const status = req.query.status as string;

      const query: any = { organizationId: req.tenantId };

      if (status) {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { masterSku: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
        ];
      }

      const total = await CanonicalProduct.countDocuments(query);
      const products = await CanonicalProduct.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // Enrich with variants and mapping count
      const productIds = products.map((p) => p._id);
      const variants = await ProductVariant.find({
        canonicalProductId: { $in: productIds },
      }).lean();

      const variantIds = variants.map((v) => v._id);
      const inventoryItems = await InventoryItem.find({
        canonicalVariantId: { $in: variantIds },
      }).lean();

      const mappings = await ProductMapping.find({
        canonicalProductId: { $in: productIds },
      }).lean();

      const enrichedProducts = products.map((prod) => {
        const prodVariants = variants.filter(
          (v) => v.canonicalProductId.toString() === prod._id.toString()
        );
        const mappedCount = mappings.filter(
          (m) => m.canonicalProductId.toString() === prod._id.toString()
        ).length;

        const totalStock = prodVariants.reduce((sum, v) => {
          const inv = inventoryItems.find(
            (i) => i.canonicalVariantId.toString() === v._id.toString()
          );
          return sum + (inv?.trackedStock || 0);
        }, 0);

        return {
          ...prod,
          variants: prodVariants,
          mappedCount,
          totalStock,
        };
      });

      return res.json({
        success: true,
        data: enrichedProducts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Failed to list products:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list products' },
      });
    }
  }

  // GET /api/v1/products/:id - Get single canonical product details with variants, inventory, and mapped channels
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const product = await CanonicalProduct.findOne({
        _id: id,
        organizationId: req.tenantId,
      }).lean();

      if (!product) {
        return res.status(404).json({
          success: false,
          error: { message: 'Product not found', code: 'NOT_FOUND' },
        });
      }

      const variants = await ProductVariant.find({
        canonicalProductId: product._id,
      }).lean();

      const variantIds = variants.map((v) => v._id);

      const inventoryItems = await InventoryItem.find({
        canonicalVariantId: { $in: variantIds },
      }).lean();

      const mappings = await ProductMapping.find({
        canonicalProductId: product._id,
      })
        .populate('channelConnectionId', 'name channelType')
        .populate('channelProductId')
        .lean();

      const enrichedVariants = variants.map((v) => {
        const inv = inventoryItems.find(
          (i) => i.canonicalVariantId.toString() === v._id.toString()
        );
        const variantMappings = mappings.filter(
          (m) => m.canonicalVariantId.toString() === v._id.toString()
        );
        return {
          ...v,
          inventory: inv || {
            trackedStock: 0,
            reservedStock: 0,
            safetyStock: 0,
            availableToAllocate: 0,
          },
          mappings: variantMappings,
        };
      });

      return res.json({
        success: true,
        data: {
          ...product,
          variants: enrichedVariants,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch product' },
      });
    }
  }

  // POST /api/v1/products - Create a canonical product with variants and initial inventory
  static async create(req: Request, res: Response) {
    try {
      const {
        title,
        masterSku,
        description,
        brand,
        category,
        tags,
        images,
        defaultCostPrice,
        defaultRetailPrice,
        variants,
      } = req.body;

      // Duplicate masterSku check
      const existingProduct = await CanonicalProduct.findOne({
        organizationId: req.tenantId,
        masterSku: masterSku.toUpperCase().trim(),
      });

      if (existingProduct) {
        return res.status(409).json({
          success: false,
          error: {
            message: `Product with master SKU ${masterSku} already exists`,
            code: 'DUPLICATE_SKU',
          },
        });
      }

      const { product, createdVariants } = await runInTransaction(async (session) => {
        const opts = session ? { session } : {};

        // Create Canonical Product
        const [prod] = await CanonicalProduct.create(
          [
            {
              organizationId: req.tenantId,
              title,
              masterSku: masterSku.toUpperCase().trim(),
              description: description || '',
              brand: brand || '',
              category: category || '',
              tags: tags || [],
              images: images || [],
              defaultCostPrice: defaultCostPrice || 0,
              defaultRetailPrice: defaultRetailPrice || 0,
              totalVariants: variants?.length || 1,
              status: ProductStatus.ACTIVE,
            },
          ],
          opts
        );

        // Create Variants and Initial Inventory
        const variantList: any[] = [];

        for (const v of variants) {
          const [variant] = await ProductVariant.create(
            [
              {
                organizationId: req.tenantId,
                canonicalProductId: prod._id,
                sku: v.sku.toUpperCase().trim(),
                barcode: v.barcode?.trim() || undefined,
                title: v.title || title,
                options: v.options || [],
                costPrice: v.costPrice ?? defaultCostPrice ?? 0,
                retailPrice: v.retailPrice ?? defaultRetailPrice ?? 0,
                compareAtPrice: v.compareAtPrice,
                weight: v.weight,
                weightUnit: v.weightUnit || 'lb',
              },
            ],
            opts
          );

          // Cost History initial entry
          await ProductCostHistory.create(
            [
              {
                organizationId: req.tenantId,
                canonicalVariantId: variant._id,
                costPrice: variant.costPrice,
                effectiveFrom: new Date(),
                reason: 'Initial creation',
              },
            ],
            opts
          );

          // Initial Inventory record
          const initialStock = v.initialStock || 0;
          const [invItem] = await InventoryItem.create(
            [
              {
                organizationId: req.tenantId,
                canonicalVariantId: variant._id,
                sku: variant.sku,
                trackedStock: initialStock,
                reservedStock: 0,
                safetyStock: 0,
                availableToAllocate: initialStock,
                lowStockThreshold: 5,
              },
            ],
            opts
          );

          if (initialStock > 0) {
            await InventoryMovement.create(
              [
                {
                  organizationId: req.tenantId,
                  canonicalVariantId: variant._id,
                  changeType: InventoryChangeType.RESTOCK,
                  quantityChanged: initialStock,
                  previousTrackedStock: 0,
                  newTrackedStock: initialStock,
                  reason: 'Initial stock intake upon product creation',
                  performedBy: req.user?.userId,
                },
              ],
              opts
            );
          }

          variantList.push({ ...variant.toObject(), inventory: invItem });
        }

        return { product: prod, createdVariants: variantList };
      });

      // Check for auto-mapping signals with existing unmapped channel products (exact SKU or Barcode)
      for (const variant of createdVariants) {
        const match = await ChannelProduct.findOne({
          organizationId: req.tenantId,
          sku: variant.sku,
        });

        if (match) {
          const alreadyMapped = await ProductMapping.findOne({
            organizationId: req.tenantId,
            channelProductId: match._id,
          });

          if (!alreadyMapped) {
            await ProductMapping.create({
              organizationId: req.tenantId,
              canonicalProductId: product._id,
              canonicalVariantId: variant._id,
              channelConnectionId: match.channelConnectionId,
              channelProductId: match._id,
              channelType: match.channelType,
              mappingConfidence: MappingConfidence.EXACT_SKU,
              syncPrice: true,
              syncInventory: true,
            });
            logger.info(`Auto-mapped variant SKU ${variant.sku} to channel product ${match._id}`);
          }
        }
      }

      logger.info(`Product created: ${product.title} (SKU: ${product.masterSku})`);

      return res.status(201).json({
        success: true,
        data: {
          ...product.toObject(),
          variants: createdVariants,
        },
      });
    } catch (error: any) {
      logger.error('Failed to create product:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create product' },
      });
    }
  }

  // PUT /api/v1/products/:id - Update product details
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { title, description, brand, category, tags, images, status, defaultCostPrice, defaultRetailPrice } = req.body;

      const product = await CanonicalProduct.findOneAndUpdate(
        { _id: id, organizationId: req.tenantId },
        {
          $set: {
            title,
            description,
            brand,
            category,
            tags,
            images,
            status,
            defaultCostPrice,
            defaultRetailPrice,
          },
        },
        { new: true }
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          error: { message: 'Product not found', code: 'NOT_FOUND' },
        });
      }

      return res.json({
        success: true,
        data: product,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update product' },
      });
    }
  }

  // DELETE /api/v1/products/:id - Archive or delete product and safely unmap
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const product = await CanonicalProduct.findOne({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: { message: 'Product not found', code: 'NOT_FOUND' },
        });
      }

      // Safe unmap
      await ProductMapping.deleteMany({
        organizationId: req.tenantId,
        canonicalProductId: product._id,
      });

      // Archive product
      product.status = ProductStatus.ARCHIVED;
      await product.save();

      return res.json({
        success: true,
        data: { message: 'Product successfully archived and unmapped from all channels' },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to archive product' },
      });
    }
  }

  // POST /api/v1/products/:id/publish - Push/publish a canonical product to connected channels (Shopify, etc.)
  static async publish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { channelConnectionId, forceRepublish } = req.body;

      const product = await CanonicalProduct.findOne({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: { message: 'Product not found', code: 'NOT_FOUND' },
        });
      }

      const variants = await ProductVariant.find({
        canonicalProductId: product._id,
        organizationId: req.tenantId,
      });

      if (variants.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Product has no variants to publish' },
        });
      }

      const variantIds = variants.map((v) => v._id);
      const inventoryItems = await InventoryItem.find({
        canonicalVariantId: { $in: variantIds },
        organizationId: req.tenantId,
      });

      // Find channel connections
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
          error: { message: 'No active sales channels found to publish to' },
        });
      }

      // Check if product is already mapped to the target channel (avoid duplicate pushing/mapping)
      if (channelConnectionId && !forceRepublish) {
        const existingMappings = await ProductMapping.find({
          organizationId: req.tenantId,
          canonicalProductId: product._id,
          channelConnectionId: connections[0]._id,
          status: MappingStatus.MAPPED,
        });

        if (existingMappings.length > 0) {
          return res.json({
            success: true,
            data: {
              alreadyMapped: true,
              channelId: connections[0]._id,
              channelName: connections[0].name,
              channelType: connections[0].channelType,
              existingMappingsCount: existingMappings.length,
              message: `Product "${product.title}" is already mapped to ${connections[0].name} (${connections[0].channelType}). Do you want to push again?`,
            },
          });
        }
      }

      const results: any[] = [];

      for (const conn of connections) {
        if (conn.channelType === ChannelType.SHOPIFY) {
          try {
            const { domain, token } = ShopifyService.getCredentials(conn);

            // Format variants with current stock
            const variantPayload = variants.map((v) => {
              const inv = inventoryItems.find(
                (i) => i.canonicalVariantId.toString() === v._id.toString()
              );
              return {
                title: v.title,
                sku: v.sku,
                barcode: v.barcode,
                retailPrice: v.retailPrice,
                compareAtPrice: v.compareAtPrice,
                weight: v.weight,
                stockQuantity: inv?.trackedStock || 0,
              };
            });

            // Check if existing mapping with Shopify product exists to update rather than create duplicate
            const existingMapping = await ProductMapping.findOne({
              organizationId: req.tenantId,
              canonicalProductId: product._id,
              channelConnectionId: conn._id,
            }).populate('channelProductId');

            const existingChProd: any = existingMapping?.channelProductId;
            let shopifyProduct: any = null;

            if (existingChProd?.externalProductId) {
              try {
                shopifyProduct = await ShopifyService.updateProduct(
                  domain,
                  token,
                  existingChProd.externalProductId,
                  {
                    title: product.title,
                    description: product.description,
                    brand: product.brand,
                    category: product.category,
                    tags: product.tags,
                    images: (product.images || []).map((img: any) =>
                      typeof img === 'string' ? img : img.url
                    ),
                  }
                );
              } catch (updErr: any) {
                logger.warn(
                  `Could not update existing Shopify product ${existingChProd.externalProductId}, falling back to publish: ${updErr.message}`
                );
              }
            }

            if (!shopifyProduct) {
              shopifyProduct = await ShopifyService.publishProduct(domain, token, {
                title: product.title,
                description: product.description,
                brand: product.brand,
                category: product.category,
                tags: product.tags,
                images: (product.images || []).map((img: any) =>
                  typeof img === 'string' ? img : img.url
                ),
                variants: variantPayload,
              });
            } else {
              // Also update variant price & inventory for existing Shopify product
              for (let i = 0; i < variants.length; i++) {
                const srcVariant = variants[i];
                const shVariant = shopifyProduct.variants?.[i] || shopifyProduct.variants?.[0];
                if (shVariant) {
                  if (typeof srcVariant.retailPrice === 'number') {
                    await ShopifyService.updateVariantPrice(
                      domain,
                      token,
                      String(shVariant.id),
                      srcVariant.retailPrice
                    );
                  }
                  const inv = inventoryItems.find(
                    (invItem) =>
                      invItem.canonicalVariantId.toString() === srcVariant._id.toString()
                  );
                  if (shVariant.inventory_item_id && inv) {
                    await ShopifyService.setInventoryLevel(
                      domain,
                      token,
                      String(shVariant.inventory_item_id),
                      inv.trackedStock || 0
                    );
                  }
                }
              }
            }

            // For each created/updated variant on Shopify, create/update ChannelProduct and ProductMapping
            const createdMappings: any[] = [];
            for (let i = 0; i < variants.length; i++) {
              const platformVariant = variants[i];
              const shVariant = shopifyProduct.variants?.[i] || shopifyProduct.variants?.[0];

              if (shVariant) {
                const channelProd = await ChannelProduct.findOneAndUpdate(
                  {
                    organizationId: req.tenantId,
                    channelConnectionId: conn._id,
                    externalProductId: String(shopifyProduct.id),
                    externalVariantId: String(shVariant.id),
                  },
                  {
                    channelType: ChannelType.SHOPIFY,
                    title: `${shopifyProduct.title} - ${shVariant.title}`,
                    sku: shVariant.sku || platformVariant.sku,
                    barcode: shVariant.barcode || platformVariant.barcode || '',
                    price: parseFloat(shVariant.price) || platformVariant.retailPrice,
                    inventoryQuantity: shVariant.inventory_quantity || 0,
                    status: ChannelProductStatus.ACTIVE,
                    syncStatus: SyncStatus.SYNCED,
                    lastSyncedAt: new Date(),
                    rawPayload: { product: shopifyProduct, variant: shVariant },
                  },
                  { upsert: true, new: true }
                );

                const mapping = await ProductMapping.findOneAndUpdate(
                  {
                    organizationId: req.tenantId,
                    canonicalVariantId: platformVariant._id,
                    channelConnectionId: conn._id,
                  },
                  {
                    canonicalProductId: product._id,
                    canonicalVariantId: platformVariant._id,
                    channelConnectionId: conn._id,
                    channelProductId: channelProd._id,
                    channelType: ChannelType.SHOPIFY,
                    mappingConfidence: MappingConfidence.EXACT_SKU,
                    syncPrice: true,
                    syncInventory: true,
                    status: MappingStatus.MAPPED,
                  },
                  { upsert: true, new: true }
                );

                createdMappings.push(mapping);
              }
            }

            conn.lastSyncAt = new Date();
            await conn.save();

            results.push({
              channelId: conn._id,
              channelName: conn.name,
              channelType: conn.channelType,
              status: 'SUCCESS',
              externalProductId: shopifyProduct.id,
              mappingsCount: createdMappings.length,
            });
          } catch (pubErr: any) {
            logger.error(`Failed to publish product ${product.masterSku} to ${conn.name}:`, pubErr);
            results.push({
              channelId: conn._id,
              channelName: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: pubErr.response?.data?.errors || pubErr.message,
            });
          }
        } else if (conn.channelType === ChannelType.EBAY) {
          try {
            const { host, token } = EbayService.getCredentials(conn);
            const createdMappings: any[] = [];

            for (let i = 0; i < variants.length; i++) {
              const platformVariant = variants[i];
              const inv = inventoryItems.find(
                (invItem) =>
                  invItem.canonicalVariantId.toString() === platformVariant._id.toString()
              );
              const variantTitle =
                variants.length === 1
                  ? product.title
                  : `${product.title} - ${platformVariant.title}`;
              const stock = inv?.trackedStock || 0;
              const images = (product.images || [])
                .map((img: any) => (typeof img === 'string' ? img : img.url))
                .filter(Boolean);

              const success = await EbayService.setInventoryItem(host, token, platformVariant.sku, {
                title: variantTitle,
                description: product.description || product.title,
                quantity: stock,
                price: platformVariant.retailPrice,
                images,
              });

              if (success) {
                const channelProd = await ChannelProduct.findOneAndUpdate(
                  {
                    organizationId: req.tenantId,
                    channelConnectionId: conn._id,
                    sku: platformVariant.sku,
                  },
                  {
                    channelType: ChannelType.EBAY,
                    externalProductId: platformVariant.sku,
                    externalVariantId: platformVariant.sku,
                    title: variantTitle,
                    sku: platformVariant.sku,
                    barcode: platformVariant.barcode || '',
                    price: platformVariant.retailPrice,
                    inventoryQuantity: stock,
                    status: ChannelProductStatus.ACTIVE,
                    syncStatus: SyncStatus.SYNCED,
                    lastSyncedAt: new Date(),
                    rawPayload: {
                      sku: platformVariant.sku,
                      title: variantTitle,
                      price: platformVariant.retailPrice,
                      quantity: stock,
                    },
                  },
                  { upsert: true, new: true }
                );

                const mapping = await ProductMapping.findOneAndUpdate(
                  {
                    organizationId: req.tenantId,
                    canonicalVariantId: platformVariant._id,
                    channelConnectionId: conn._id,
                  },
                  {
                    canonicalProductId: product._id,
                    canonicalVariantId: platformVariant._id,
                    channelConnectionId: conn._id,
                    channelProductId: channelProd._id,
                    channelType: ChannelType.EBAY,
                    mappingConfidence: MappingConfidence.EXACT_SKU,
                    syncPrice: true,
                    syncInventory: true,
                    status: MappingStatus.MAPPED,
                  },
                  { upsert: true, new: true }
                );

                createdMappings.push(mapping);
              }
            }

            conn.lastSyncAt = new Date();
            await conn.save();

            results.push({
              channelId: conn._id,
              channelName: conn.name,
              channelType: conn.channelType,
              status: 'SUCCESS',
              mappingsCount: createdMappings.length,
            });
          } catch (pubErr: any) {
            logger.error(`Failed to publish product ${product.masterSku} to ${conn.name}:`, pubErr);
            results.push({
              channelId: conn._id,
              channelName: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: pubErr.response?.data?.errors || pubErr.message,
            });
          }
        }
      }

      const allFailed = results.length > 0 && results.every((r) => r.status === 'FAILED');
      if (allFailed) {
        return res.status(400).json({
          success: false,
          error: {
            message: results.map((r) => `${r.channelName}: ${r.error}`).join('; '),
            code: 'PUBLISH_FAILED',
          },
          data: { results },
        });
      }

      return res.json({
        success: true,
        data: {
          alreadyMapped: false,
          productId: product._id,
          title: product.title,
          results,
          message: `Successfully pushed "${product.title}" to ${results
            .filter((r) => r.status === 'SUCCESS')
            .map((r) => r.channelName)
            .join(', ')}!`,
        },
      });
    } catch (error: any) {
      logger.error('Failed to publish product:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to publish product' },
      });
    }
  }
}

