import { Request, Response } from 'express';
import {
  ProductMapping,
  CanonicalProduct,
  ProductVariant,
  ChannelProduct,
  ChannelConnection,
} from '../../database/models';
import {
  ChannelType,
  ChannelProductStatus,
  SyncStatus,
  MappingConfidence,
  MappingStatus,
  NotificationSeverity,
  NotificationCategory,
} from '@multichannel/shared';
import { ShopifyService } from '../../services/shopify.service';
import { EbayService } from '../../services/ebay.service';
import { NotificationService } from '../../services/notification.service';
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

      await NotificationService.create({
        organizationId: req.tenantId,
        title: `Product Mapped: ${channelProduct.title}`,
        message: `Linked channel product "${channelProduct.title}" to catalog SKU "${variant.sku}".`,
        severity: NotificationSeverity.SUCCESS,
        category: NotificationCategory.INTEGRATION,
        channelType: channelProduct.channelType,
        link: '/mappings',
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

      if (mappedCount > 0) {
        await NotificationService.create({
          organizationId: req.tenantId,
          title: `Products Bulk Mapped`,
          message: `Successfully mapped ${mappedCount} products across connected channels.`,
          severity: NotificationSeverity.SUCCESS,
          category: NotificationCategory.INTEGRATION,
          link: '/mappings',
        });
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

  // GET /api/v1/mappings/unmapped - List all unmapped products with store details
  static async listUnmapped(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const query = {
        organizationId: req.tenantId,
        status: MappingStatus.UNMAPPED,
      };

      const total = await ProductMapping.countDocuments(query);
      const unmappedMappings = await ProductMapping.find(query)
        .populate('canonicalProductId', 'title masterSku description category images brand status')
        .populate('canonicalVariantId', 'title sku barcode costPrice retailPrice weight')
        .populate('channelConnectionId', 'name channelType status')
        .populate('channelProductId', 'title sku barcode price inventoryQuantity externalProductId externalVariantId status rawPayload')
        .sort({ unmappedAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        data: unmappedMappings,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      logger.error('Failed to list unmapped products:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list unmapped products' },
      });
    }
  }

  // DELETE /api/v1/mappings/:id - Safe unmapping from database and external channel store
  static async unmap(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleteFromStore = req.query.deleteFromStore !== 'false';

      const mapping = await ProductMapping.findOne({
        _id: id,
        organizationId: req.tenantId,
      })
        .populate('canonicalProductId')
        .populate('canonicalVariantId')
        .populate('channelConnectionId')
        .populate('channelProductId');

      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: { message: 'Mapping not found', code: 'NOT_FOUND' },
        });
      }

      const conn: any = mapping.channelConnectionId;
      const chProd: any = mapping.channelProductId;
      let storeDeleted = false;
      let storeDeleteMessage = '';

      // Unmap / delete product from the external sales channel store (Shopify / eBay)
      if (deleteFromStore && conn && chProd) {
        if (conn.channelType === ChannelType.SHOPIFY && chProd.externalProductId) {
          try {
            const { domain, token } = ShopifyService.getCredentials(conn);
            storeDeleted = await ShopifyService.deleteProduct(domain, token, chProd.externalProductId);
            if (storeDeleted) {
              storeDeleteMessage = `and deleted from Shopify (${conn.name})`;
            }
          } catch (shopErr: any) {
            logger.warn(`Could not delete product ${chProd.externalProductId} from Shopify store: ${shopErr.message}`);
          }
        } else if (conn.channelType === ChannelType.EBAY && (chProd.sku || (mapping.canonicalVariantId as any)?.sku)) {
          try {
            const sku = chProd.sku || (mapping.canonicalVariantId as any)?.sku;
            const { host, token } = await EbayService.getValidCredentials(conn);
            storeDeleted = await EbayService.deleteInventoryItem(host, token, sku);
            if (storeDeleted) {
              storeDeleteMessage = `and deleted from eBay (${conn.name})`;
            }
          } catch (ebayErr: any) {
            logger.warn(`Could not delete inventory item from eBay store: ${ebayErr.message}`);
          }
        }
      }

      // Mark mapping status as UNMAPPED so it is recorded on the Unmapped Products page
      mapping.status = MappingStatus.UNMAPPED;
      mapping.unmappedAt = new Date();
      mapping.unmappedReason = (req.body?.reason || req.query?.reason || 'User unmapped from product mapping page') as string;
      await mapping.save();

      // Mark ChannelProduct as UNPUBLISHED / unmapped
      if (chProd?._id) {
        await ChannelProduct.findByIdAndUpdate(chProd._id, {
          $set: {
            status: ChannelProductStatus.UNPUBLISHED,
            syncStatus: SyncStatus.OUT_OF_SYNC,
          },
        });
      }

      const finalMsg = storeDeleted
        ? `Product listing unmapped from platform ${storeDeleteMessage}`
        : `Product listing successfully unmapped from ${conn?.name || 'channel'}`;

      const prodTitle = (mapping.canonicalProductId as any)?.title || chProd?.title || 'Product';
      await NotificationService.create({
        organizationId: req.tenantId,
        title: `Product Unmapped: ${prodTitle}`,
        message: finalMsg,
        severity: NotificationSeverity.WARNING,
        category: NotificationCategory.INTEGRATION,
        channelType: conn?.channelType,
        link: '/mappings/unmapped',
      });

      return res.json({
        success: true,
        data: {
          message: finalMsg,
          storeDeleted,
        },
      });
    } catch (error: any) {
      logger.error('Failed to unmap product:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to unmap listing' },
      });
    }
  }

  // POST /api/v1/mappings/:id/remap - Re-map an unmapped product to its channel
  static async remap(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findOne({
        _id: id,
        organizationId: req.tenantId,
      })
        .populate('canonicalProductId')
        .populate('canonicalVariantId')
        .populate('channelConnectionId')
        .populate('channelProductId');

      if (!mapping) {
        return res.status(404).json({
          success: false,
          error: { message: 'Unmapped product record not found', code: 'NOT_FOUND' },
        });
      }

      const conn: any = mapping.channelConnectionId;
      const prod: any = mapping.canonicalProductId;
      const variant: any = mapping.canonicalVariantId;
      let chProd: any = mapping.channelProductId;

      if (!conn || !prod || !variant) {
        return res.status(400).json({
          success: false,
          error: { message: 'Missing product, variant, or channel connection data required to re-map' },
        });
      }

      // Re-publish or re-create on the external store if needed
      if (conn.channelType === ChannelType.SHOPIFY) {
        try {
          const { domain, token } = ShopifyService.getCredentials(conn);
          const published = await ShopifyService.publishProduct(domain, token, {
            title: prod.title,
            description: prod.description,
            brand: prod.brand,
            category: prod.category,
            tags: prod.tags,
            images: (prod.images || []).map((img: any) => (typeof img === 'string' ? img : img.url)),
            variants: [
              {
                title: variant.title,
                sku: variant.sku,
                barcode: variant.barcode,
                retailPrice: variant.retailPrice,
                compareAtPrice: variant.compareAtPrice,
                weight: variant.weight,
                stockQuantity: 10,
              },
            ],
          });

          if (published && published.id) {
            const createdVar = published.variants?.[0];
            if (chProd) {
              chProd.externalProductId = String(published.id);
              chProd.externalVariantId = createdVar?.id ? String(createdVar.id) : '';
              chProd.status = ChannelProductStatus.ACTIVE;
              chProd.syncStatus = SyncStatus.SYNCED;
              chProd.lastSyncedAt = new Date();
              await chProd.save();
            } else {
              chProd = await ChannelProduct.create({
                organizationId: req.tenantId,
                channelConnectionId: conn._id,
                channelType: ChannelType.SHOPIFY,
                externalProductId: String(published.id),
                externalVariantId: createdVar?.id ? String(createdVar.id) : '',
                title: prod.title,
                sku: variant.sku,
                barcode: variant.barcode,
                price: variant.retailPrice,
                inventoryQuantity: 10,
                status: ChannelProductStatus.ACTIVE,
                syncStatus: SyncStatus.SYNCED,
                lastSyncedAt: new Date(),
                rawPayload: published,
              });
              mapping.channelProductId = chProd._id;
            }
          }
        } catch (pubErr: any) {
          logger.warn(`Could not re-publish to Shopify store during remap: ${pubErr.message}`);
        }
      } else if (conn.channelType === ChannelType.EBAY) {
        try {
          const { host, token } = await EbayService.getValidCredentials(conn);
          const images = (prod.images || [])
            .map((img: any) => (typeof img === 'string' ? img : img.url))
            .filter(Boolean);

          await EbayService.setInventoryItem(host, token, variant.sku, {
            title: prod.title,
            description: prod.description || prod.title,
            quantity: 10,
            price: variant.retailPrice,
            images,
          });

          if (chProd) {
            chProd.status = ChannelProductStatus.ACTIVE;
            chProd.syncStatus = SyncStatus.SYNCED;
            chProd.lastSyncedAt = new Date();
            await chProd.save();
          }
        } catch (ebayErr: any) {
          logger.warn(`Could not re-create eBay inventory item during remap: ${ebayErr.message}`);
        }
      }

      // Restore mapping status to active MAPPED
      mapping.status = MappingStatus.MAPPED;
      mapping.unmappedAt = undefined;
      mapping.unmappedReason = undefined;
      await mapping.save();

      await NotificationService.create({
        organizationId: req.tenantId,
        title: `Product Re-mapped: ${prod.title}`,
        message: `Product "${prod.title}" was successfully re-mapped and synced with ${conn.name} (${conn.channelType}).`,
        severity: NotificationSeverity.SUCCESS,
        category: NotificationCategory.INTEGRATION,
        channelType: conn.channelType,
        link: '/mappings',
      });

      return res.json({
        success: true,
        data: {
          message: `Product "${prod.title}" successfully re-mapped to ${conn.name}!`,
          mapping,
        },
      });
    } catch (error: any) {
      logger.error('Failed to remap product:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to re-map product to channel' },
      });
    }
  }

  // DELETE /api/v1/mappings/:id/permanent - Permanently dismiss/delete unmapped product record
  static async deletePermanent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deleted = await ProductMapping.findOneAndDelete({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { message: 'Record not found', code: 'NOT_FOUND' },
        });
      }

      return res.json({
        success: true,
        data: { message: 'Unmapped product record permanently dismissed' },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to dismiss record' },
      });
    }
  }

  // DELETE /api/v1/mappings - Reset all mappings or unmap in bulk
  static async unmapAll(req: Request, res: Response) {
    try {
      const { channelConnectionId, deleteFromStore = 'true' } = req.query;
      const query: any = { organizationId: req.tenantId, status: MappingStatus.MAPPED };
      if (channelConnectionId) {
        query.channelConnectionId = channelConnectionId;
      }

      const mappings = await ProductMapping.find(query)
        .populate('channelConnectionId')
        .populate('channelProductId')
        .populate('canonicalVariantId');

      let storeDeletedCount = 0;
      for (const m of mappings) {
        const conn: any = m.channelConnectionId;
        const chProd: any = m.channelProductId;
        if (deleteFromStore === 'true' && conn && chProd) {
          if (conn.channelType === ChannelType.SHOPIFY && chProd.externalProductId) {
            try {
              const { domain, token } = ShopifyService.getCredentials(conn);
              await ShopifyService.deleteProduct(domain, token, chProd.externalProductId);
              storeDeletedCount++;
            } catch {}
          } else if (conn.channelType === ChannelType.EBAY && (chProd.sku || (m.canonicalVariantId as any)?.sku)) {
            try {
              const sku = chProd.sku || (m.canonicalVariantId as any)?.sku;
              const { host, token } = await EbayService.getValidCredentials(conn);
              await EbayService.deleteInventoryItem(host, token, sku);
              storeDeletedCount++;
            } catch {}
          }
        }

        m.status = MappingStatus.UNMAPPED;
        m.unmappedAt = new Date();
        m.unmappedReason = 'Bulk unmapped by user';
        await m.save();

        if (chProd?._id) {
          await ChannelProduct.findByIdAndUpdate(chProd._id, {
            $set: { status: ChannelProductStatus.UNPUBLISHED, syncStatus: SyncStatus.OUT_OF_SYNC },
          });
        }
      }

      return res.json({
        success: true,
        data: {
          unmappedCount: mappings.length,
          storeDeletedCount,
          message: `Successfully unmapped ${mappings.length} listings (removed from connected stores)`,
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
