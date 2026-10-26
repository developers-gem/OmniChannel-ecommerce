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
import { NotificationService } from '../../services/notification.service';

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
          (m) =>
            m.canonicalProductId.toString() === prod._id.toString() &&
            m.status === MappingStatus.MAPPED
        ).length;
        const unmappedCount = mappings.filter(
          (m) =>
            m.canonicalProductId.toString() === prod._id.toString() &&
            m.status === MappingStatus.UNMAPPED
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
          unmappedCount,
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

        const effectiveVariants = Array.isArray(variants) && variants.length > 0
          ? variants
          : [
              {
                sku: masterSku.toUpperCase().trim(),
                title: title || 'Standard',
                barcode: undefined,
                options: [{ name: 'Option', value: 'Default' }],
                costPrice: defaultCostPrice || 0,
                retailPrice: defaultRetailPrice || 0,
                initialStock: req.body.defaultInitialStock || 0,
              },
            ];

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
              totalVariants: effectiveVariants.length,
              status: ProductStatus.ACTIVE,
            },
          ],
          opts
        );

        // Create Variants and Initial Inventory
        const variantList: any[] = [];

        for (const v of effectiveVariants) {
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

      await NotificationService.notifyProductModified({
        organizationId: req.tenantId,
        productTitle: product.title,
        source: 'Platform Catalog Editor',
        changesSummary: `Updated status: ${product.status}, default retail price: $${product.defaultRetailPrice}.`,
        link: '/products',
      });

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

  // GET /api/v1/products/zero-mapped - List all canonical products with 0 active mappings or unmapped from channels
  static async listZeroMapped(req: Request, res: Response) {
    try {
      const search = (req.query.search as string) || '';

      const activeChannels = await ChannelConnection.find({
        organizationId: req.tenantId,
        status: ChannelStatus.ACTIVE,
      }).lean();

      const prodQuery: any = { organizationId: req.tenantId };
      if (search) {
        prodQuery.$or = [
          { title: { $regex: search, $options: 'i' } },
          { masterSku: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } },
        ];
      }

      const products = await CanonicalProduct.find(prodQuery)
        .sort({ createdAt: -1 })
        .lean();

      const productIds = products.map((p) => p._id);

      const variants = await ProductVariant.find({
        canonicalProductId: { $in: productIds },
        organizationId: req.tenantId,
      }).lean();

      const variantIds = variants.map((v) => v._id);
      const inventoryItems = await InventoryItem.find({
        canonicalVariantId: { $in: variantIds },
        organizationId: req.tenantId,
      }).lean();

      const mappings = await ProductMapping.find({
        canonicalProductId: { $in: productIds },
        organizationId: req.tenantId,
      })
        .populate('channelConnectionId', 'name channelType status')
        .lean();

      const enrichedList: any[] = [];

      for (const prod of products) {
        const prodVariants = variants.filter(
          (v) => v.canonicalProductId.toString() === prod._id.toString()
        );
        const prodMappings = mappings.filter(
          (m) => m.canonicalProductId.toString() === prod._id.toString()
        );

        const activeMapped = prodMappings.filter((m) => m.status === MappingStatus.MAPPED);
        const unmapped = prodMappings.filter((m) => m.status === MappingStatus.UNMAPPED);

        const totalStock = prodVariants.reduce((sum, v) => {
          const inv = inventoryItems.find(
            (i) => i.canonicalVariantId.toString() === v._id.toString()
          );
          return sum + (inv?.trackedStock || 0);
        }, 0);

        const unmappedFrom = unmapped.map((m: any) => ({
          channelConnectionId: m.channelConnectionId?._id || m.channelConnectionId,
          channelName: m.channelConnectionId?.name || 'Store',
          channelType: m.channelConnectionId?.channelType || m.channelType,
          unmappedAt: m.unmappedAt || m.updatedAt,
          unmappedReason: m.unmappedReason || 'Unmapped from product mapping page',
        }));

        const activeChannelsList = activeMapped.map((m: any) => ({
          channelConnectionId: m.channelConnectionId?._id || m.channelConnectionId,
          channelName: m.channelConnectionId?.name || 'Store',
          channelType: m.channelConnectionId?.channelType || m.channelType,
        }));

        const activeChannelIdSet = new Set(
          activeChannelsList.map((c) => String(c.channelConnectionId))
        );

        const availableChannels = activeChannels.map((c: any) => {
          const isMapped = activeChannelIdSet.has(String(c._id));
          const wasUnmapped = unmapped.some(
            (u: any) => String(u.channelConnectionId?._id || u.channelConnectionId) === String(c._id)
          );
          return {
            channelConnectionId: c._id,
            channelName: c.name,
            channelType: c.channelType,
            isMapped,
            isPreviouslyUnmapped: wasUnmapped,
          };
        });

        const isZeroMapped = activeMapped.length === 0;

        // Include all products that have 0 active mappings OR have unmapped channel records
        if (isZeroMapped || unmapped.length > 0) {
          enrichedList.push({
            ...prod,
            variants: prodVariants,
            totalStock,
            activeMappedCount: activeMapped.length,
            isZeroMapped,
            unmappedFrom,
            activeChannels: activeChannelsList,
            availableChannels,
          });
        }
      }

      return res.json({
        success: true,
        data: enrichedList,
        totalZeroMapped: enrichedList.filter((p) => p.isZeroMapped).length,
        totalWithUnmappedChannels: enrichedList.length,
        activeChannels: activeChannels.map((c: any) => ({
          id: c._id,
          name: c.name,
          channelType: c.channelType,
        })),
      });
    } catch (error: any) {
      logger.error('Failed to list 0-mapped products:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list 0-mapped products' },
      });
    }
  }

  // POST /api/v1/products/:id/publish - Push/publish a canonical product to connected channels (Shopify, etc.)
  static async publish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        channelConnectionId,
        channelConnectionIds,
        forceRepublish,
        markupPercent,
        channelMarkups,
      } = req.body;

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

      const targetIds = Array.isArray(channelConnectionIds) && channelConnectionIds.length > 0
        ? channelConnectionIds
        : (channelConnectionId ? (Array.isArray(channelConnectionId) ? channelConnectionId : [channelConnectionId]) : null);

      if (targetIds && targetIds.length > 0) {
        connQuery._id = { $in: targetIds };
      }
      const connections = await ChannelConnection.find(connQuery);

      if (connections.length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'No active sales channels found to publish to' },
        });
      }

      // Check if product is already mapped to the target channel (avoid duplicate pushing/mapping)
      if (connections.length === 1 && !forceRepublish) {
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
        const chIdStr = conn._id.toString();
        const feePercent = typeof channelMarkups?.[chIdStr] === 'number'
          ? channelMarkups[chIdStr]
          : (typeof markupPercent === 'number' ? markupPercent : 0);

        if (conn.channelType === ChannelType.SHOPIFY) {
          try {
            const { domain, token } = ShopifyService.getCredentials(conn);

            // Format variants with current stock and adjusted retail price (platform price + channel platform charge)
            const variantPayload = variants.map((v) => {
              const inv = inventoryItems.find(
                (i) => i.canonicalVariantId.toString() === v._id.toString()
              );
              const basePrice = typeof v.retailPrice === 'number' && !isNaN(v.retailPrice) ? v.retailPrice : (product.defaultRetailPrice || 0);
              const finalPrice = feePercent > 0
                ? Math.round(basePrice * (1 + feePercent / 100) * 100) / 100
                : basePrice;

              return {
                title: v.title,
                sku: v.sku,
                barcode: v.barcode,
                retailPrice: finalPrice,
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
                  const basePrice = typeof srcVariant.retailPrice === 'number' ? srcVariant.retailPrice : (product.defaultRetailPrice || 0);
                  const finalPrice = feePercent > 0
                    ? Math.round(basePrice * (1 + feePercent / 100) * 100) / 100
                    : basePrice;

                  await ShopifyService.updateVariantPrice(
                    domain,
                    token,
                    String(shVariant.id),
                    finalPrice
                  );
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
                    $set: {
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
                    $unset: {
                      unmappedAt: 1,
                      unmappedReason: 1,
                    },
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
            const rawErrors = pubErr.response?.data?.errors;
            let errorMsg = pubErr.message || 'Publishing failed';
            if (rawErrors) {
              if (typeof rawErrors === 'string') {
                errorMsg = rawErrors;
              } else if (typeof rawErrors === 'object') {
                errorMsg = JSON.stringify(rawErrors);
              }
            } else if (pubErr.response?.data?.message) {
              errorMsg = pubErr.response.data.message;
            }

            logger.error(`Failed to publish product ${product.masterSku} to ${conn.name}: ${errorMsg}`);
            results.push({
              channelId: conn._id,
              channelName: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: errorMsg,
            });
          }
        } else if (conn.channelType === ChannelType.EBAY) {
          try {
            const { host, token } = await EbayService.getValidCredentials(conn);
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

              const basePrice = typeof platformVariant.retailPrice === 'number' ? platformVariant.retailPrice : (product.defaultRetailPrice || 0);
              const finalPrice = feePercent > 0
                ? Math.round(basePrice * (1 + feePercent / 100) * 100) / 100
                : basePrice;

              const success = await EbayService.setInventoryItem(host, token, platformVariant.sku, {
                title: variantTitle,
                description: product.description || product.title,
                quantity: stock,
                price: finalPrice,
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
                    price: finalPrice,
                    inventoryQuantity: stock,
                    status: ChannelProductStatus.ACTIVE,
                    syncStatus: SyncStatus.SYNCED,
                    lastSyncedAt: new Date(),
                    rawPayload: {
                      sku: platformVariant.sku,
                      title: variantTitle,
                      price: finalPrice,
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
                    $set: {
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
                    $unset: {
                      unmappedAt: 1,
                      unmappedReason: 1,
                    },
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
            const rawErrors = pubErr.response?.data?.errors;
            let errorMsg = pubErr.message || 'Publishing failed';
            if (rawErrors) {
              if (typeof rawErrors === 'string') {
                errorMsg = rawErrors;
              } else if (typeof rawErrors === 'object') {
                errorMsg = JSON.stringify(rawErrors);
              }
            } else if (pubErr.response?.data?.message) {
              errorMsg = pubErr.response.data.message;
            }

            logger.error(`Failed to publish product ${product.masterSku} to ${conn.name}: ${errorMsg}`);
            results.push({
              channelId: conn._id,
              channelName: conn.name,
              channelType: conn.channelType,
              status: 'FAILED',
              error: errorMsg,
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

      for (const resItem of results.filter((r) => r.status === 'SUCCESS')) {
        await NotificationService.notifyProductUploaded({
          organizationId: req.tenantId,
          productTitle: product.title,
          channelName: resItem.channelName,
          channelType: resItem.channelType,
          sku: product.masterSku,
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
      logger.error('Failed to publish product:', error?.message || String(error));
      return res.status(500).json({
        success: false,
        error: { message: error?.message || 'Failed to publish product' },
      });
    }
  }

  // POST /api/v1/products/bulk-publish - Bulk map/push multiple products to selected channels
  static async bulkPublish(req: Request, res: Response) {
    try {
      const { items, productIds, channelConnectionIds, forceRepublish = true } = req.body;

      let tasks: { productId: string; targetChannelIds?: string[] }[] = [];

      if (Array.isArray(items) && items.length > 0) {
        tasks = items.map((item: any) => ({
          productId: String(item.productId),
          targetChannelIds:
            Array.isArray(item.channelConnectionIds) && item.channelConnectionIds.length > 0
              ? item.channelConnectionIds
              : Array.isArray(channelConnectionIds)
              ? channelConnectionIds
              : undefined,
        }));
      } else if (Array.isArray(productIds) && productIds.length > 0) {
        const defaultTargets =
          Array.isArray(channelConnectionIds) && channelConnectionIds.length > 0
            ? channelConnectionIds
            : undefined;
        tasks = productIds.map((pId: string) => ({
          productId: String(pId),
          targetChannelIds: defaultTargets,
        }));
      } else {
        return res.status(400).json({
          success: false,
          error: { message: 'Must provide either "items" or "productIds"' },
        });
      }

      const overallResults: any[] = [];
      let successfulCount = 0;
      let failedCount = 0;

      for (const task of tasks) {
        try {
          const fakeReq: any = {
            params: { id: task.productId },
            body: {
              channelConnectionIds: task.targetChannelIds,
              forceRepublish,
            },
            tenantId: req.tenantId,
          };

          let capturedData: any = null;
          let capturedError: any = null;
          let capturedStatus = 200;

          const fakeRes: any = {
            status: (st: number) => {
              capturedStatus = st;
              return fakeRes;
            },
            json: (payload: any) => {
              if (payload.success) {
                capturedData = payload.data;
              } else {
                capturedError = payload.error;
              }
              return fakeRes;
            },
          };

          await ProductsController.publish(fakeReq, fakeRes);

          if (capturedData && capturedStatus < 400) {
            successfulCount++;
            overallResults.push({
              productId: task.productId,
              title: capturedData.title,
              success: true,
              results: capturedData.results,
            });
          } else {
            failedCount++;
            overallResults.push({
              productId: task.productId,
              success: false,
              error: capturedError?.message || 'Publishing failed',
            });
          }
        } catch (err: any) {
          failedCount++;
          overallResults.push({
            productId: task.productId,
            success: false,
            error: err.message || 'Publishing failed',
          });
        }
      }

      if (successfulCount > 0) {
        await NotificationService.notifyProductUploaded({
          organizationId: req.tenantId,
          productTitle: `${successfulCount} Products`,
          channelName: 'Connected Channels',
          channelType: ChannelType.CUSTOM_STORE,
          count: successfulCount,
        });
      }

      return res.json({
        success: true,
        data: {
          totalProcessed: tasks.length,
          successfulCount,
          failedCount,
          results: overallResults,
          message: `Successfully mapped and pushed ${successfulCount} products!${
            failedCount > 0 ? ` (${failedCount} had errors or missing channels)` : ''
          }`,
        },
      });
    } catch (error: any) {
      logger.error('Failed to bulk publish products:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to bulk publish products' },
      });
    }
  }
}

