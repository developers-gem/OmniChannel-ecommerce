import { Request, Response } from 'express';
import {
  ProductMapping,
  CanonicalProduct,
  ProductVariant,
  ChannelProduct,
  ChannelConnection,
} from '../../database/models';
import { MappingConfidence, MappingStatus } from '@multichannel/shared';
import { logger } from '../../utils/logger';

export class MappingsController {
  // GET /api/v1/mappings - List mapped channel listings
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const query = { organizationId: req.tenantId, status: MappingStatus.MAPPED };

      const total = await ProductMapping.countDocuments(query);
      const mappings = await ProductMapping.find(query)
        .populate('canonicalProductId', 'title masterSku')
        .populate('canonicalVariantId', 'title sku barcode costPrice retailPrice')
        .populate('channelConnectionId', 'name channelType')
        .populate('channelProductId', 'title sku barcode price inventoryQuantity externalProductId externalVariantId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        data: mappings,
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
        error: { message: error.message || 'Failed to list mappings' },
      });
    }
  }

  // GET /api/v1/mappings/suggestions - Generate intelligent mapping suggestions (Exact SKU, Exact Barcode, Title similarity)
  static async getSuggestions(req: Request, res: Response) {
    try {
      // Find all unmapped channel products
      const mappedChannelProductIds = await ProductMapping.distinct('channelProductId', {
        organizationId: req.tenantId,
        status: MappingStatus.MAPPED,
      });

      const unmappedChannelProducts = await ChannelProduct.find({
        organizationId: req.tenantId,
        _id: { $nin: mappedChannelProductIds },
      })
        .populate('channelConnectionId', 'name channelType')
        .limit(100)
        .lean();

      const suggestions: any[] = [];

      for (const cp of unmappedChannelProducts) {
        let matchCandidate: any = null;
        let confidence: MappingConfidence = MappingConfidence.MANUAL;
        let matchReason = '';

        // 1. Exact SKU match (Strongest signal)
        if (cp.sku) {
          const variant = await ProductVariant.findOne({
            organizationId: req.tenantId,
            sku: cp.sku.toUpperCase().trim(),
          }).populate('canonicalProductId', 'title masterSku');

          if (variant) {
            matchCandidate = variant;
            confidence = MappingConfidence.EXACT_SKU;
            matchReason = `Exact SKU match (${cp.sku})`;
          }
        }

        // 2. Exact Barcode match
        if (!matchCandidate && cp.barcode) {
          const variant = await ProductVariant.findOne({
            organizationId: req.tenantId,
            barcode: cp.barcode.trim(),
          }).populate('canonicalProductId', 'title masterSku');

          if (variant) {
            matchCandidate = variant;
            confidence = MappingConfidence.EXACT_BARCODE;
            matchReason = `Exact Barcode match (${cp.barcode})`;
          }
        }

        // 3. Exact or Base Title match (Safe, prevents false positives)
        if (!matchCandidate && cp.title) {
          const cleanCpTitle = cp.title.trim().toLowerCase();
          const baseCpTitle = cleanCpTitle.split(' - ')[0].trim();
          const escapedBase = baseCpTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedFull = cleanCpTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

          const product = await CanonicalProduct.findOne({
            organizationId: req.tenantId,
            $or: [
              { title: { $regex: `^${escapedBase}$`, $options: 'i' } },
              { title: { $regex: `^${escapedFull}$`, $options: 'i' } },
            ],
          });

          if (product) {
            let variant = await ProductVariant.findOne({
              canonicalProductId: product._id,
              organizationId: req.tenantId,
              title: { $regex: escapedFull, $options: 'i' },
            });

            if (!variant) {
              variant = await ProductVariant.findOne({
                canonicalProductId: product._id,
                organizationId: req.tenantId,
              });
            }

            if (variant) {
              matchCandidate = variant;
              confidence = MappingConfidence.AI_SUGGESTED;
              matchReason = `Title match ("${product.title}")`;
            }
          }
        }

        if (matchCandidate) {
          suggestions.push({
            channelProduct: cp,
            suggestedVariant: matchCandidate,
            suggestedProduct: matchCandidate.canonicalProductId,
            confidence,
            matchReason,
          });
        }
      }

      return res.json({
        success: true,
        data: suggestions,
      });
    } catch (error: any) {
      logger.error('Failed to get mapping suggestions:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to generate mapping suggestions' },
      });
    }
  }

  // POST /api/v1/mappings/map - Explicitly map a channel product to a canonical variant
  static async map(req: Request, res: Response) {
    try {
      const { canonicalVariantId, channelProductId, syncPrice, syncInventory, priceModifier } = req.body;

      const variant = await ProductVariant.findOne({
        _id: canonicalVariantId,
        organizationId: req.tenantId,
      });
      if (!variant) {
        return res.status(404).json({
          success: false,
          error: { message: 'Canonical variant not found', code: 'VARIANT_NOT_FOUND' },
        });
      }

      const channelProduct = await ChannelProduct.findOne({
        _id: channelProductId,
        organizationId: req.tenantId,
      });
      if (!channelProduct) {
        return res.status(404).json({
          success: false,
          error: { message: 'Channel product not found', code: 'CHANNEL_PRODUCT_NOT_FOUND' },
        });
      }

      // Check if already mapped
      const existingMapping = await ProductMapping.findOne({
        organizationId: req.tenantId,
        channelProductId: channelProduct._id,
      });

      if (existingMapping) {
        existingMapping.canonicalProductId = variant.canonicalProductId;
        existingMapping.canonicalVariantId = variant._id;
        existingMapping.syncPrice = syncPrice ?? true;
        existingMapping.syncInventory = syncInventory ?? true;
        existingMapping.priceModifier = priceModifier;
        existingMapping.status = MappingStatus.MAPPED;
        await existingMapping.save();

        return res.json({
          success: true,
          data: existingMapping,
        });
      }

      const mapping = await ProductMapping.create({
        organizationId: req.tenantId,
        canonicalProductId: variant.canonicalProductId,
        canonicalVariantId: variant._id,
        channelConnectionId: channelProduct.channelConnectionId,
        channelProductId: channelProduct._id,
        channelType: channelProduct.channelType,
        mappingConfidence:
          channelProduct.sku === variant.sku
            ? MappingConfidence.EXACT_SKU
            : MappingConfidence.MANUAL,
        syncPrice: syncPrice ?? true,
        syncInventory: syncInventory ?? true,
        priceModifier,
        status: MappingStatus.MAPPED,
      });

      return res.status(201).json({
        success: true,
        data: mapping,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create product mapping' },
      });
    }
  }

  // POST /api/v1/mappings/bulk-map - Bulk accept suggestions
  static async bulkMap(req: Request, res: Response) {
    try {
      const { mappings } = req.body; // Array of { canonicalVariantId, channelProductId }
      let mappedCount = 0;

      for (const item of mappings) {
        const variant = await ProductVariant.findOne({
          _id: item.canonicalVariantId,
          organizationId: req.tenantId,
        });
        const channelProduct = await ChannelProduct.findOne({
          _id: item.channelProductId,
          organizationId: req.tenantId,
        });

        if (variant && channelProduct) {
          await ProductMapping.findOneAndUpdate(
            { organizationId: req.tenantId, channelProductId: channelProduct._id },
            {
              $set: {
                canonicalProductId: variant.canonicalProductId,
                canonicalVariantId: variant._id,
                channelConnectionId: channelProduct.channelConnectionId,
                channelProductId: channelProduct._id,
                channelType: channelProduct.channelType,
                mappingConfidence:
                  channelProduct.sku === variant.sku
                    ? MappingConfidence.EXACT_SKU
                    : (item.confidence || MappingConfidence.MANUAL),
                syncPrice: true,
                syncInventory: true,
                status: MappingStatus.MAPPED,
              },
            },
            { upsert: true, new: true }
          );
          mappedCount++;
        }
      }

      return res.json({
        success: true,
        data: { mappedCount },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to bulk map' },
      });
    }
  }

  // DELETE /api/v1/mappings/:id - Safe unmapping
  static async unmap(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findOneAndDelete({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: { message: 'Mapping not found', code: 'NOT_FOUND' },
        });
      }

      return res.json({
        success: true,
        data: { message: 'Product listing successfully unmapped' },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to unmap listing' },
      });
    }
  }

  // DELETE /api/v1/mappings - Reset all mappings or unmap in bulk
  static async unmapAll(req: Request, res: Response) {
    try {
      const { channelConnectionId } = req.query;
      const query: any = { organizationId: req.tenantId };
      if (channelConnectionId) {
        query.channelConnectionId = channelConnectionId;
      }

      const result = await ProductMapping.deleteMany(query);
      return res.json({
        success: true,
        data: {
          deletedCount: result.deletedCount,
          message: `Successfully unmapped ${result.deletedCount} listings`,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to unmap all listings' },
      });
    }
  }
}
