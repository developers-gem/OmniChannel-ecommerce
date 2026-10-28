"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryController = void 0;
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const logger_1 = require("../../utils/logger");
const shopify_service_1 = require("../../services/shopify.service");
class InventoryController {
    // GET /api/v1/inventory - List stock items with comprehensive SKU, price, shipping, health status, and channel sync info
    static async list(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const lowStockOnly = req.query.lowStock === 'true';
            const search = (req.query.search || '').trim();
            const query = { organizationId: req.tenantId };
            if (lowStockOnly) {
                query.$expr = { $lte: ['$availableToAllocate', '$lowStockThreshold'] };
            }
            if (search) {
                query.sku = { $regex: search, $options: 'i' };
            }
            const total = await models_1.InventoryItem.countDocuments(query);
            const items = await models_1.InventoryItem.find(query)
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
            const mappings = await models_1.ProductMapping.find({
                organizationId: req.tenantId,
                canonicalVariantId: { $in: variantIds },
            })
                .populate('channelConnectionId', 'name channelType status')
                .populate('channelProductId', 'externalProductId externalVariantId title price inventoryQuantity syncStatus lastSyncedAt')
                .lean();
            // Fetch active channel connections in this organization (Shopify, eBay, etc.)
            const activeConnections = await models_1.ChannelConnection.find({
                organizationId: req.tenantId,
                status: shared_1.ChannelStatus.ACTIVE,
            })
                .select('name channelType status lastSyncAt')
                .lean();
            // Fetch allocations for these items
            const allocations = await models_1.InventoryAllocation.find({
                organizationId: req.tenantId,
                canonicalVariantId: { $in: variantIds },
            })
                .populate('channelConnectionId', 'name channelType')
                .lean();
            const enrichedItems = items.map((item) => {
                const variant = item.canonicalVariantId;
                const product = variant?.canonicalProductId;
                const variantMappings = mappings.filter((m) => m.canonicalVariantId?.toString() === variant?._id?.toString());
                const itemAllocations = allocations.filter((a) => a.canonicalVariantId?.toString() === variant?._id?.toString());
                const trackedStock = item.trackedStock ?? 0;
                const availableToAllocate = item.availableToAllocate ?? 0;
                const lowStockThreshold = item.lowStockThreshold ?? 5;
                // Determine Health Status
                let healthStatus = 'IN_STOCK';
                if (trackedStock <= 0) {
                    healthStatus = 'OUT_OF_STOCK';
                }
                else if (availableToAllocate <= lowStockThreshold) {
                    healthStatus = 'LOW_STOCK';
                }
                // Determine Price & Shipping
                const retailPrice = variant?.retailPrice ?? product?.defaultRetailPrice ?? 0;
                const costPrice = variant?.costPrice ?? product?.defaultCostPrice ?? 0;
                const shippingCharge = variant?.shippingCharge ?? item.shippingCharge ?? product?.shippingCharge ?? 0;
                const status = product?.status || shared_1.ProductStatus.ACTIVE;
                // Check if row data changed / out-of-sync
                const hasExplicitDataChanged = item.isDataChanged === true || variant?.isDataChanged === true;
                const hasUnsyncedMapping = variantMappings.length > 0 && variantMappings.some((m) => {
                    const chProd = m.channelProductId;
                    return chProd?.syncStatus !== shared_1.SyncStatus.SYNCED;
                });
                const isNeverSynced = variantMappings.length === 0;
                const isDataChanged = hasExplicitDataChanged || hasUnsyncedMapping;
                // Channel summary list
                const channelDetails = activeConnections.map((conn) => {
                    const m = variantMappings.find((mapping) => mapping.channelConnectionId?._id?.toString() === conn._id?.toString());
                    const chProd = m?.channelProductId;
                    return {
                        connectionId: conn._id,
                        name: conn.name,
                        channelType: conn.channelType,
                        isMapped: !!m,
                        syncStatus: m ? (chProd?.syncStatus || shared_1.SyncStatus.SYNCED) : 'NOT_MAPPED',
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
        }
        catch (error) {
            logger_1.logger.error('Failed to list inventory items:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list inventory items' },
            });
        }
    }
    // POST /api/v1/inventory/:variantId/adjust - Atomically adjust inventory, prices, shipping, and status with audit movement logging
    static async adjust(req, res) {
        try {
            const { variantId } = req.params;
            const { trackedStock, safetyStock, retailPrice, costPrice, shippingCharge, status, reason = 'Inventory & details update', } = req.body;
            const item = await models_1.InventoryItem.findOne({
                organizationId: req.tenantId,
                canonicalVariantId: variantId,
            });
            if (!item) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Inventory item not found' },
                });
            }
            const variant = await models_1.ProductVariant.findOne({
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
                    const updateProduct = {};
                    if (retailPrice !== undefined)
                        updateProduct.defaultRetailPrice = Number(retailPrice);
                    if (costPrice !== undefined)
                        updateProduct.defaultCostPrice = Number(costPrice);
                    if (shippingCharge !== undefined)
                        updateProduct.shippingCharge = Number(shippingCharge);
                    if (status)
                        updateProduct.status = status;
                    if (Object.keys(updateProduct).length > 0) {
                        await models_1.CanonicalProduct.findByIdAndUpdate(variant.canonicalProductId, {
                            $set: updateProduct,
                        });
                    }
                }
            }
            // Create immutable movement entry
            await models_1.InventoryMovement.create({
                organizationId: req.tenantId,
                canonicalVariantId: item.canonicalVariantId,
                changeType: shared_1.InventoryChangeType.MANUAL_ADJUSTMENT,
                quantityChanged,
                previousTrackedStock: previousStock,
                newTrackedStock: newStock,
                reason: reason || 'Manual stock and details adjustment',
                performedBy: req.user?.userId,
            });
            logger_1.logger.info(`Inventory & details updated for SKU ${item.sku}: stock ${previousStock} -> ${newStock}, retailPrice: ${retailPrice}, reason: ${reason}`);
            return res.json({
                success: true,
                data: item,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to adjust inventory:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to adjust inventory' },
            });
        }
    }
    // POST /api/v1/inventory/:variantId/sync-channels - Push updated inventory, retail price, and custom eBay price to channels
    static async syncChannels(req, res) {
        try {
            const { variantId } = req.params;
            const { channels = [] } = req.body;
            const item = await models_1.InventoryItem.findOne({
                organizationId: req.tenantId,
                canonicalVariantId: variantId,
            });
            const variant = await models_1.ProductVariant.findOne({
                organizationId: req.tenantId,
                _id: variantId,
            });
            if (!item || !variant) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Variant or Inventory item not found' },
                });
            }
            const canonicalProduct = await models_1.CanonicalProduct.findById(variant.canonicalProductId);
            const results = [];
            for (const ch of channels) {
                const { channelConnectionId, price, ebayMarkupPercent } = ch;
                const conn = await models_1.ChannelConnection.findOne({
                    _id: channelConnectionId,
                    organizationId: req.tenantId,
                });
                if (!conn)
                    continue;
                // SHOPIFY SYNC
                if (conn.channelType === shared_1.ChannelType.SHOPIFY) {
                    try {
                        const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                        let mapping = await models_1.ProductMapping.findOne({
                            organizationId: req.tenantId,
                            canonicalVariantId: variant._id,
                            channelConnectionId: conn._id,
                        }).populate('channelProductId');
                        const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;
                        if (mapping && mapping.channelProductId) {
                            const chProd = mapping.channelProductId;
                            const invItemId = chProd.rawPayload?.variant?.inventory_item_id;
                            if (invItemId) {
                                await shopify_service_1.ShopifyService.setInventoryLevel(domain, token, String(invItemId), item.availableToAllocate);
                            }
                            if (chProd.externalVariantId) {
                                await shopify_service_1.ShopifyService.updateVariantPrice(domain, token, chProd.externalVariantId, targetPrice);
                            }
                            chProd.price = targetPrice;
                            chProd.inventoryQuantity = item.availableToAllocate;
                            chProd.syncStatus = shared_1.SyncStatus.SYNCED;
                            chProd.lastSyncedAt = new Date();
                            await chProd.save();
                            mapping.status = shared_1.MappingStatus.MAPPED;
                            mapping.updatedAt = new Date();
                            await mapping.save();
                            results.push({
                                channel: conn.name,
                                channelType: conn.channelType,
                                status: 'SYNCED',
                                price: targetPrice,
                                stock: item.availableToAllocate,
                            });
                        }
                        else {
                            // Publish new product to Shopify if not mapped yet
                            if (canonicalProduct) {
                                const shopifyProduct = await shopify_service_1.ShopifyService.publishProduct(domain, token, {
                                    title: canonicalProduct.title,
                                    description: canonicalProduct.description || '',
                                    brand: canonicalProduct.brand || 'Generic',
                                    category: canonicalProduct.category || 'General',
                                    tags: canonicalProduct.tags || [],
                                    images: (canonicalProduct.images || []).map((img) => typeof img === 'string' ? img : img.url),
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
                                const channelProd = await models_1.ChannelProduct.create({
                                    organizationId: req.tenantId,
                                    channelConnectionId: conn._id,
                                    channelType: shared_1.ChannelType.SHOPIFY,
                                    externalProductId: String(shopifyProduct.id),
                                    externalVariantId: shVariant ? String(shVariant.id) : '',
                                    title: `${shopifyProduct.title} - ${variant.title}`,
                                    sku: variant.sku,
                                    price: targetPrice,
                                    inventoryQuantity: item.availableToAllocate,
                                    status: shared_1.ChannelProductStatus.ACTIVE,
                                    syncStatus: shared_1.SyncStatus.SYNCED,
                                    lastSyncedAt: new Date(),
                                    rawPayload: { product: shopifyProduct, variant: shVariant },
                                });
                                await models_1.ProductMapping.create({
                                    organizationId: req.tenantId,
                                    canonicalProductId: canonicalProduct._id,
                                    canonicalVariantId: variant._id,
                                    channelConnectionId: conn._id,
                                    channelProductId: channelProd._id,
                                    channelType: shared_1.ChannelType.SHOPIFY,
                                    mappingConfidence: shared_1.MappingConfidence.EXACT_SKU,
                                    syncPrice: true,
                                    syncInventory: true,
                                    status: shared_1.MappingStatus.MAPPED,
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
                    }
                    catch (err) {
                        logger_1.logger.error(`Shopify sync failed: ${err.message}`);
                        results.push({
                            channel: conn.name,
                            channelType: conn.channelType,
                            status: 'FAILED',
                            error: err.message,
                        });
                    }
                }
                // EBAY SYNC (Supports custom pricing to account for higher eBay fees)
                else if (conn.channelType === shared_1.ChannelType.EBAY) {
                    const targetPrice = price !== undefined ? Number(price) : variant.retailPrice;
                    let mapping = await models_1.ProductMapping.findOne({
                        organizationId: req.tenantId,
                        canonicalVariantId: variant._id,
                        channelConnectionId: conn._id,
                    }).populate('channelProductId');
                    let channelProd = mapping?.channelProductId;
                    if (!channelProd) {
                        channelProd = await models_1.ChannelProduct.create({
                            organizationId: req.tenantId,
                            channelConnectionId: conn._id,
                            channelType: shared_1.ChannelType.EBAY,
                            externalProductId: `EBAY-${variant.sku}`,
                            externalVariantId: `EBAY-VAR-${variant.sku}`,
                            title: `${canonicalProduct?.title || variant.title} (eBay Listing)`,
                            sku: variant.sku,
                            price: targetPrice,
                            inventoryQuantity: item.availableToAllocate,
                            status: shared_1.ChannelProductStatus.ACTIVE,
                            syncStatus: shared_1.SyncStatus.SYNCED,
                            lastSyncedAt: new Date(),
                            rawPayload: { ebayFeeBufferApplied: true, markupPercent: ebayMarkupPercent || 0 },
                        });
                        await models_1.ProductMapping.create({
                            organizationId: req.tenantId,
                            canonicalProductId: variant.canonicalProductId,
                            canonicalVariantId: variant._id,
                            channelConnectionId: conn._id,
                            channelProductId: channelProd._id,
                            channelType: shared_1.ChannelType.EBAY,
                            priceModifier: { type: 'FIXED', value: targetPrice },
                            syncPrice: true,
                            syncInventory: true,
                            status: shared_1.MappingStatus.MAPPED,
                        });
                    }
                    else {
                        channelProd.price = targetPrice;
                        channelProd.inventoryQuantity = item.availableToAllocate;
                        channelProd.syncStatus = shared_1.SyncStatus.SYNCED;
                        channelProd.lastSyncedAt = new Date();
                        channelProd.rawPayload = {
                            ...channelProd.rawPayload,
                            ebayFeeBufferApplied: true,
                            markupPercent: ebayMarkupPercent || 0,
                        };
                        await channelProd.save();
                        mapping.priceModifier = { type: 'FIXED', value: targetPrice };
                        mapping.updatedAt = new Date();
                        await mapping.save();
                    }
                    results.push({
                        channel: conn.name,
                        channelType: conn.channelType,
                        status: 'SYNCED',
                        price: targetPrice,
                        stock: item.availableToAllocate,
                        note: 'eBay custom fee-adjusted price applied successfully',
                    });
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
        }
        catch (error) {
            logger_1.logger.error('Failed to sync channels for variant:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to sync to channels' },
            });
        }
    }
    // GET /api/v1/inventory/movements - Get historical inventory movement ledger
    static async getMovements(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 30;
            const variantId = req.query.variantId;
            const query = { organizationId: req.tenantId };
            if (variantId) {
                query.canonicalVariantId = variantId;
            }
            const total = await models_1.InventoryMovement.countDocuments(query);
            const movements = await models_1.InventoryMovement.find(query)
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list inventory movements' },
            });
        }
    }
    // PUT /api/v1/inventory/:variantId/allocations - Set channel allocation policy
    static async setAllocation(req, res) {
        try {
            const { variantId } = req.params;
            const { channelConnectionId, allocationType, allocationValue } = req.body;
            const allocation = await models_1.InventoryAllocation.findOneAndUpdate({
                organizationId: req.tenantId,
                canonicalVariantId: variantId,
                channelConnectionId,
            }, {
                $set: {
                    allocationType: allocationType || shared_1.AllocationType.SHARED_POOL,
                    allocationValue: allocationValue ?? 100,
                },
            }, { upsert: true, new: true });
            return res.json({
                success: true,
                data: allocation,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update channel allocation' },
            });
        }
    }
}
exports.InventoryController = InventoryController;
//# sourceMappingURL=inventory.controller.js.map