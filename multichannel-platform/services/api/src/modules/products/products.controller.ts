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
} from '../../database/models';
import { ProductStatus, InventoryChangeType, MappingConfidence } from '@multichannel/shared';
import { runInTransaction } from '../../database';
import { logger } from '../../utils/logger';

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
}
