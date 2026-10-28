"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MappingsController = void 0;
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const shopify_service_1 = require("../../services/shopify.service");
const ebay_service_1 = require("../../services/ebay.service");
const notification_service_1 = require("../../services/notification.service");
const logger_1 = require("../../utils/logger");
class MappingsController {
    // GET /api/v1/mappings - List mapped channel listings
    static async list(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const query = { organizationId: req.tenantId, status: shared_1.MappingStatus.MAPPED };
            const total = await models_1.ProductMapping.countDocuments(query);
            const mappings = await models_1.ProductMapping.find(query)
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list mappings' },
            });
        }
    }
    // GET /api/v1/mappings/suggestions - Generate intelligent mapping suggestions (Exact SKU, Exact Barcode, Title similarity)
    static async getSuggestions(req, res) {
        try {
            // Find all unmapped channel products
            const mappedChannelProductIds = await models_1.ProductMapping.distinct('channelProductId', {
                organizationId: req.tenantId,
                status: shared_1.MappingStatus.MAPPED,
            });
            const unmappedChannelProducts = await models_1.ChannelProduct.find({
                organizationId: req.tenantId,
                _id: { $nin: mappedChannelProductIds },
            })
                .populate('channelConnectionId', 'name channelType')
                .limit(100)
                .lean();
            const suggestions = [];
            for (const cp of unmappedChannelProducts) {
                let matchCandidate = null;
                let confidence = shared_1.MappingConfidence.MANUAL;
                let matchReason = '';
                // 1. Exact SKU match (Strongest signal)
                if (cp.sku) {
                    const variant = await models_1.ProductVariant.findOne({
                        organizationId: req.tenantId,
                        sku: cp.sku.toUpperCase().trim(),
                    }).populate('canonicalProductId', 'title masterSku');
                    if (variant) {
                        matchCandidate = variant;
                        confidence = shared_1.MappingConfidence.EXACT_SKU;
                        matchReason = `Exact SKU match (${cp.sku})`;
                    }
                }
                // 2. Exact Barcode match
                if (!matchCandidate && cp.barcode) {
                    const variant = await models_1.ProductVariant.findOne({
                        organizationId: req.tenantId,
                        barcode: cp.barcode.trim(),
                    }).populate('canonicalProductId', 'title masterSku');
                    if (variant) {
                        matchCandidate = variant;
                        confidence = shared_1.MappingConfidence.EXACT_BARCODE;
                        matchReason = `Exact Barcode match (${cp.barcode})`;
                    }
                }
                // 3. Exact or Base Title match (Safe, prevents false positives)
                if (!matchCandidate && cp.title) {
                    const cleanCpTitle = cp.title.trim().toLowerCase();
                    const baseCpTitle = cleanCpTitle.split(' - ')[0].trim();
                    const escapedBase = baseCpTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const escapedFull = cleanCpTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const product = await models_1.CanonicalProduct.findOne({
                        organizationId: req.tenantId,
                        $or: [
                            { title: { $regex: `^${escapedBase}$`, $options: 'i' } },
                            { title: { $regex: `^${escapedFull}$`, $options: 'i' } },
                        ],
                    });
                    if (product) {
                        let variant = await models_1.ProductVariant.findOne({
                            canonicalProductId: product._id,
                            organizationId: req.tenantId,
                            title: { $regex: escapedFull, $options: 'i' },
                        });
                        if (!variant) {
                            variant = await models_1.ProductVariant.findOne({
                                canonicalProductId: product._id,
                                organizationId: req.tenantId,
                            });
                        }
                        if (variant) {
                            matchCandidate = variant;
                            confidence = shared_1.MappingConfidence.AI_SUGGESTED;
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
        }
        catch (error) {
            logger_1.logger.error('Failed to get mapping suggestions:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to generate mapping suggestions' },
            });
        }
    }
    // POST /api/v1/mappings/map - Explicitly map a channel product to a canonical variant
    static async map(req, res) {
        try {
            const { canonicalVariantId, channelProductId, syncPrice, syncInventory, priceModifier } = req.body;
            const variant = await models_1.ProductVariant.findOne({
                _id: canonicalVariantId,
                organizationId: req.tenantId,
            });
            if (!variant) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Canonical variant not found', code: 'VARIANT_NOT_FOUND' },
                });
            }
            const channelProduct = await models_1.ChannelProduct.findOne({
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
            const existingMapping = await models_1.ProductMapping.findOne({
                organizationId: req.tenantId,
                channelProductId: channelProduct._id,
            });
            if (existingMapping) {
                existingMapping.canonicalProductId = variant.canonicalProductId;
                existingMapping.canonicalVariantId = variant._id;
                existingMapping.syncPrice = syncPrice ?? true;
                existingMapping.syncInventory = syncInventory ?? true;
                existingMapping.priceModifier = priceModifier;
                existingMapping.status = shared_1.MappingStatus.MAPPED;
                await existingMapping.save();
                return res.json({
                    success: true,
                    data: existingMapping,
                });
            }
            const mapping = await models_1.ProductMapping.create({
                organizationId: req.tenantId,
                canonicalProductId: variant.canonicalProductId,
                canonicalVariantId: variant._id,
                channelConnectionId: channelProduct.channelConnectionId,
                channelProductId: channelProduct._id,
                channelType: channelProduct.channelType,
                mappingConfidence: channelProduct.sku === variant.sku
                    ? shared_1.MappingConfidence.EXACT_SKU
                    : shared_1.MappingConfidence.MANUAL,
                syncPrice: syncPrice ?? true,
                syncInventory: syncInventory ?? true,
                priceModifier,
                status: shared_1.MappingStatus.MAPPED,
            });
            await notification_service_1.NotificationService.create({
                organizationId: req.tenantId,
                title: `Product Mapped: ${channelProduct.title}`,
                message: `Linked channel product "${channelProduct.title}" to catalog SKU "${variant.sku}".`,
                severity: shared_1.NotificationSeverity.SUCCESS,
                category: shared_1.NotificationCategory.INTEGRATION,
                channelType: channelProduct.channelType,
                link: '/mappings',
            });
            return res.status(201).json({
                success: true,
                data: mapping,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create product mapping' },
            });
        }
    }
    // POST /api/v1/mappings/bulk-map - Bulk accept suggestions
    static async bulkMap(req, res) {
        try {
            const { mappings } = req.body; // Array of { canonicalVariantId, channelProductId }
            let mappedCount = 0;
            for (const item of mappings) {
                const variant = await models_1.ProductVariant.findOne({
                    _id: item.canonicalVariantId,
                    organizationId: req.tenantId,
                });
                const channelProduct = await models_1.ChannelProduct.findOne({
                    _id: item.channelProductId,
                    organizationId: req.tenantId,
                });
                if (variant && channelProduct) {
                    await models_1.ProductMapping.findOneAndUpdate({ organizationId: req.tenantId, channelProductId: channelProduct._id }, {
                        $set: {
                            canonicalProductId: variant.canonicalProductId,
                            canonicalVariantId: variant._id,
                            channelConnectionId: channelProduct.channelConnectionId,
                            channelProductId: channelProduct._id,
                            channelType: channelProduct.channelType,
                            mappingConfidence: channelProduct.sku === variant.sku
                                ? shared_1.MappingConfidence.EXACT_SKU
                                : (item.confidence || shared_1.MappingConfidence.MANUAL),
                            syncPrice: true,
                            syncInventory: true,
                            status: shared_1.MappingStatus.MAPPED,
                        },
                    }, { upsert: true, new: true });
                    mappedCount++;
                }
            }
            if (mappedCount > 0) {
                await notification_service_1.NotificationService.create({
                    organizationId: req.tenantId,
                    title: `Products Bulk Mapped`,
                    message: `Successfully mapped ${mappedCount} products across connected channels.`,
                    severity: shared_1.NotificationSeverity.SUCCESS,
                    category: shared_1.NotificationCategory.INTEGRATION,
                    link: '/mappings',
                });
            }
            return res.json({
                success: true,
                data: { mappedCount },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to bulk map' },
            });
        }
    }
    // GET /api/v1/mappings/unmapped - List all unmapped products with store details
    static async listUnmapped(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const query = {
                organizationId: req.tenantId,
                status: shared_1.MappingStatus.UNMAPPED,
            };
            const total = await models_1.ProductMapping.countDocuments(query);
            const unmappedMappings = await models_1.ProductMapping.find(query)
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
        }
        catch (error) {
            logger_1.logger.error('Failed to list unmapped products:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list unmapped products' },
            });
        }
    }
    // DELETE /api/v1/mappings/:id - Safe unmapping from database and external channel store
    static async unmap(req, res) {
        try {
            const { id } = req.params;
            const deleteFromStore = req.query.deleteFromStore !== 'false';
            const mapping = await models_1.ProductMapping.findOne({
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
            const conn = mapping.channelConnectionId;
            const chProd = mapping.channelProductId;
            let storeDeleted = false;
            let storeDeleteMessage = '';
            // Unmap / delete product from the external sales channel store (Shopify / eBay)
            if (deleteFromStore && conn && chProd) {
                if (conn.channelType === shared_1.ChannelType.SHOPIFY && chProd.externalProductId) {
                    try {
                        const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                        storeDeleted = await shopify_service_1.ShopifyService.deleteProduct(domain, token, chProd.externalProductId);
                        if (storeDeleted) {
                            storeDeleteMessage = `and deleted from Shopify (${conn.name})`;
                        }
                    }
                    catch (shopErr) {
                        logger_1.logger.warn(`Could not delete product ${chProd.externalProductId} from Shopify store: ${shopErr.message}`);
                    }
                }
                else if (conn.channelType === shared_1.ChannelType.EBAY && (chProd.sku || mapping.canonicalVariantId?.sku)) {
                    try {
                        const sku = chProd.sku || mapping.canonicalVariantId?.sku;
                        const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                        storeDeleted = await ebay_service_1.EbayService.deleteInventoryItem(host, token, sku);
                        if (storeDeleted) {
                            storeDeleteMessage = `and deleted from eBay (${conn.name})`;
                        }
                    }
                    catch (ebayErr) {
                        logger_1.logger.warn(`Could not delete inventory item from eBay store: ${ebayErr.message}`);
                    }
                }
            }
            // Mark mapping status as UNMAPPED so it is recorded on the Unmapped Products page
            mapping.status = shared_1.MappingStatus.UNMAPPED;
            mapping.unmappedAt = new Date();
            mapping.unmappedReason = (req.body?.reason || req.query?.reason || 'User unmapped from product mapping page');
            await mapping.save();
            // Mark ChannelProduct as UNPUBLISHED / unmapped
            if (chProd?._id) {
                await models_1.ChannelProduct.findByIdAndUpdate(chProd._id, {
                    $set: {
                        status: shared_1.ChannelProductStatus.UNPUBLISHED,
                        syncStatus: shared_1.SyncStatus.OUT_OF_SYNC,
                    },
                });
            }
            const finalMsg = storeDeleted
                ? `Product listing unmapped from platform ${storeDeleteMessage}`
                : `Product listing successfully unmapped from ${conn?.name || 'channel'}`;
            const prodTitle = mapping.canonicalProductId?.title || chProd?.title || 'Product';
            await notification_service_1.NotificationService.create({
                organizationId: req.tenantId,
                title: `Product Unmapped: ${prodTitle}`,
                message: finalMsg,
                severity: shared_1.NotificationSeverity.WARNING,
                category: shared_1.NotificationCategory.INTEGRATION,
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
        }
        catch (error) {
            logger_1.logger.error('Failed to unmap product:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to unmap listing' },
            });
        }
    }
    // POST /api/v1/mappings/:id/remap - Re-map an unmapped product to its channel
    static async remap(req, res) {
        try {
            const { id } = req.params;
            const mapping = await models_1.ProductMapping.findOne({
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
            const conn = mapping.channelConnectionId;
            const prod = mapping.canonicalProductId;
            const variant = mapping.canonicalVariantId;
            let chProd = mapping.channelProductId;
            if (!conn || !prod || !variant) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Missing product, variant, or channel connection data required to re-map' },
                });
            }
            // Re-publish or re-create on the external store if needed
            if (conn.channelType === shared_1.ChannelType.SHOPIFY) {
                try {
                    const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                    const published = await shopify_service_1.ShopifyService.publishProduct(domain, token, {
                        title: prod.title,
                        description: prod.description,
                        brand: prod.brand,
                        category: prod.category,
                        tags: prod.tags,
                        images: (prod.images || []).map((img) => (typeof img === 'string' ? img : img.url)),
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
                            chProd.status = shared_1.ChannelProductStatus.ACTIVE;
                            chProd.syncStatus = shared_1.SyncStatus.SYNCED;
                            chProd.lastSyncedAt = new Date();
                            await chProd.save();
                        }
                        else {
                            chProd = await models_1.ChannelProduct.create({
                                organizationId: req.tenantId,
                                channelConnectionId: conn._id,
                                channelType: shared_1.ChannelType.SHOPIFY,
                                externalProductId: String(published.id),
                                externalVariantId: createdVar?.id ? String(createdVar.id) : '',
                                title: prod.title,
                                sku: variant.sku,
                                barcode: variant.barcode,
                                price: variant.retailPrice,
                                inventoryQuantity: 10,
                                status: shared_1.ChannelProductStatus.ACTIVE,
                                syncStatus: shared_1.SyncStatus.SYNCED,
                                lastSyncedAt: new Date(),
                                rawPayload: published,
                            });
                            mapping.channelProductId = chProd._id;
                        }
                    }
                }
                catch (pubErr) {
                    logger_1.logger.warn(`Could not re-publish to Shopify store during remap: ${pubErr.message}`);
                }
            }
            else if (conn.channelType === shared_1.ChannelType.EBAY) {
                try {
                    const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                    const images = (prod.images || [])
                        .map((img) => (typeof img === 'string' ? img : img.url))
                        .filter(Boolean);
                    const setResult = await ebay_service_1.EbayService.setInventoryItem(host, token, variant.sku, {
                        title: prod.title,
                        description: prod.description || prod.title,
                        quantity: 10,
                        price: variant.retailPrice,
                        images,
                        brand: prod.brand || 'Generic',
                        marketplaceId: conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : undefined),
                    });
                    if (chProd) {
                        if (setResult.listingId) {
                            chProd.externalProductId = setResult.listingId;
                        }
                        chProd.status = shared_1.ChannelProductStatus.ACTIVE;
                        chProd.syncStatus = shared_1.SyncStatus.SYNCED;
                        chProd.lastSyncedAt = new Date();
                        await chProd.save();
                    }
                }
                catch (ebayErr) {
                    logger_1.logger.warn(`Could not re-create eBay inventory item during remap: ${ebayErr.message}`);
                }
            }
            // Restore mapping status to active MAPPED
            mapping.status = shared_1.MappingStatus.MAPPED;
            mapping.set('unmappedAt', undefined);
            mapping.set('unmappedReason', undefined);
            await mapping.save();
            await models_1.ProductMapping.updateOne({ _id: mapping._id }, { $unset: { unmappedAt: 1, unmappedReason: 1 }, $set: { status: shared_1.MappingStatus.MAPPED } });
            await notification_service_1.NotificationService.create({
                organizationId: req.tenantId,
                title: `Product Re-mapped: ${prod.title}`,
                message: `Product "${prod.title}" was successfully re-mapped and synced with ${conn.name} (${conn.channelType}).`,
                severity: shared_1.NotificationSeverity.SUCCESS,
                category: shared_1.NotificationCategory.INTEGRATION,
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
        }
        catch (error) {
            logger_1.logger.error('Failed to remap product:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to re-map product to channel' },
            });
        }
    }
    // DELETE /api/v1/mappings/:id/permanent - Permanently dismiss/delete unmapped product record
    static async deletePermanent(req, res) {
        try {
            const { id } = req.params;
            const deleted = await models_1.ProductMapping.findOneAndDelete({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to dismiss record' },
            });
        }
    }
    // DELETE /api/v1/mappings - Reset all mappings or unmap in bulk
    static async unmapAll(req, res) {
        try {
            const { channelConnectionId, deleteFromStore = 'true' } = req.query;
            const query = { organizationId: req.tenantId, status: shared_1.MappingStatus.MAPPED };
            if (channelConnectionId) {
                query.channelConnectionId = channelConnectionId;
            }
            const mappings = await models_1.ProductMapping.find(query)
                .populate('channelConnectionId')
                .populate('channelProductId')
                .populate('canonicalVariantId');
            let storeDeletedCount = 0;
            for (const m of mappings) {
                const conn = m.channelConnectionId;
                const chProd = m.channelProductId;
                if (deleteFromStore === 'true' && conn && chProd) {
                    if (conn.channelType === shared_1.ChannelType.SHOPIFY && chProd.externalProductId) {
                        try {
                            const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                            await shopify_service_1.ShopifyService.deleteProduct(domain, token, chProd.externalProductId);
                            storeDeletedCount++;
                        }
                        catch { }
                    }
                    else if (conn.channelType === shared_1.ChannelType.EBAY && (chProd.sku || m.canonicalVariantId?.sku)) {
                        try {
                            const sku = chProd.sku || m.canonicalVariantId?.sku;
                            const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                            await ebay_service_1.EbayService.deleteInventoryItem(host, token, sku);
                            storeDeletedCount++;
                        }
                        catch { }
                    }
                }
                m.status = shared_1.MappingStatus.UNMAPPED;
                m.unmappedAt = new Date();
                m.unmappedReason = 'Bulk unmapped by user';
                await m.save();
                if (chProd?._id) {
                    await models_1.ChannelProduct.findByIdAndUpdate(chProd._id, {
                        $set: { status: shared_1.ChannelProductStatus.UNPUBLISHED, syncStatus: shared_1.SyncStatus.OUT_OF_SYNC },
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to unmap all listings' },
            });
        }
    }
}
exports.MappingsController = MappingsController;
//# sourceMappingURL=mappings.controller.js.map