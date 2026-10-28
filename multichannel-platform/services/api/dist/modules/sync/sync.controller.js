"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncController = void 0;
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const logger_1 = require("../../utils/logger");
const shopify_service_1 = require("../../services/shopify.service");
const ebay_service_1 = require("../../services/ebay.service");
const notification_service_1 = require("../../services/notification.service");
class SyncController {
    // GET /api/v1/sync/jobs - List synchronization jobs and status
    static async listJobs(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const total = await models_1.SyncJob.countDocuments({ organizationId: req.tenantId });
            const jobs = await models_1.SyncJob.find({ organizationId: req.tenantId })
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list sync jobs' },
            });
        }
    }
    // POST /api/v1/sync/trigger - Trigger synchronization job (Catalog, Inventory, Orders, Reconciliation)
    static async triggerSync(req, res) {
        try {
            const { channelConnectionId, jobType, details } = req.body;
            if (!jobType || !Object.values(shared_1.SyncJobType).includes(jobType)) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Valid jobType is required', code: 'INVALID_JOB_TYPE' },
                });
            }
            let connection = null;
            if (channelConnectionId) {
                connection = await models_1.ChannelConnection.findOne({
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
            const syncJob = await models_1.SyncJob.create({
                organizationId: req.tenantId,
                channelConnectionId: connection?._id,
                jobType,
                status: shared_1.SyncJobStatus.PROCESSING,
                details: details || {},
                attemptCount: 1,
            });
            // Execute sync processing asynchronously
            setTimeout(async () => {
                try {
                    let syncedCount = 0;
                    // 1. CATALOG_IMPORT: Fetch products from Shopify into ChannelProduct
                    if (jobType === shared_1.SyncJobType.CATALOG_IMPORT) {
                        const connections = connection
                            ? [connection]
                            : await models_1.ChannelConnection.find({
                                organizationId: req.tenantId,
                                status: shared_1.ChannelStatus.ACTIVE,
                            });
                        for (const conn of connections) {
                            if (conn.channelType === shared_1.ChannelType.SHOPIFY) {
                                try {
                                    const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                                    const products = await shopify_service_1.ShopifyService.fetchAllProducts(domain, token);
                                    for (const prod of products) {
                                        const { mappedCount } = await shopify_service_1.ShopifyService.ingestShopifyProduct({
                                            organizationId: req.tenantId,
                                            connection: conn,
                                            shopifyProduct: prod,
                                        });
                                        syncedCount += mappedCount;
                                    }
                                    // Auto-register webhooks for real-time updates
                                    shopify_service_1.ShopifyService.registerWebhooks(domain, token, conn._id.toString()).catch((e) => logger_1.logger.warn(`Could not register webhooks during sync: ${e.message}`));
                                    conn.lastSyncAt = new Date();
                                    await conn.save();
                                    logger_1.logger.info(`Successfully imported ${syncedCount} Shopify products from ${domain}`);
                                    if (syncedCount > 0) {
                                        await notification_service_1.NotificationService.notifyProductImported({
                                            organizationId: req.tenantId,
                                            channelName: conn.name,
                                            channelType: shared_1.ChannelType.SHOPIFY,
                                            count: syncedCount,
                                        });
                                    }
                                }
                                catch (fetchErr) {
                                    logger_1.logger.error(`Failed to fetch Shopify products for ${conn.name}: ${fetchErr.message}`);
                                }
                            }
                            else if (conn.channelType === shared_1.ChannelType.EBAY) {
                                try {
                                    const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                                    const items = await ebay_service_1.EbayService.getInventoryItems(host, token, 100, conn);
                                    const activeSkus = new Set();
                                    for (const item of items) {
                                        if (!item.sku)
                                            continue;
                                        activeSkus.add(item.sku.toUpperCase().trim());
                                        const listingId = item.listingId || item.sku;
                                        const chProd = await models_1.ChannelProduct.findOneAndUpdate({
                                            organizationId: req.tenantId,
                                            channelConnectionId: conn._id,
                                            sku: item.sku.toUpperCase().trim(),
                                        }, {
                                            channelType: shared_1.ChannelType.EBAY,
                                            externalProductId: listingId,
                                            externalVariantId: item.sku,
                                            title: item.title,
                                            sku: item.sku.toUpperCase().trim(),
                                            barcode: '',
                                            price: item.price || 0,
                                            inventoryQuantity: item.quantity || 0,
                                            status: shared_1.ChannelProductStatus.ACTIVE,
                                            syncStatus: shared_1.SyncStatus.SYNCED,
                                            lastSyncedAt: new Date(),
                                            rawPayload: {
                                                ebayItem: item.raw,
                                                images: item.images,
                                                description: item.description,
                                                listingId,
                                                offerId: item.offerId,
                                            },
                                        }, { upsert: true, new: true });
                                        // Auto-ingest into Master Catalog if not yet present
                                        let canonicalProd = await models_1.CanonicalProduct.findOne({
                                            organizationId: req.tenantId,
                                            $or: [{ masterSku: item.sku.toUpperCase().trim() }, { title: item.title }],
                                        });
                                        if (!canonicalProd) {
                                            canonicalProd = await models_1.CanonicalProduct.create({
                                                organizationId: req.tenantId,
                                                title: item.title,
                                                masterSku: item.sku.toUpperCase().trim(),
                                                description: item.description || item.title,
                                                brand: item.aspects?.Brand?.[0] || 'eBay',
                                                category: item.aspects?.Type?.[0] || 'General',
                                                tags: ['eBay'],
                                                images: (item.images || []).map((url, idx) => ({
                                                    url,
                                                    altText: item.title,
                                                    position: idx,
                                                    isPrimary: idx === 0,
                                                })),
                                                defaultCostPrice: 0,
                                                defaultRetailPrice: item.price || 0,
                                                totalVariants: 1,
                                                status: shared_1.ProductStatus.ACTIVE,
                                            });
                                        }
                                        let variant = await models_1.ProductVariant.findOne({
                                            organizationId: req.tenantId,
                                            canonicalProductId: canonicalProd._id,
                                            sku: item.sku.toUpperCase().trim(),
                                        });
                                        if (!variant) {
                                            variant = await models_1.ProductVariant.create({
                                                organizationId: req.tenantId,
                                                canonicalProductId: canonicalProd._id,
                                                sku: item.sku.toUpperCase().trim(),
                                                title: item.title,
                                                costPrice: 0,
                                                retailPrice: item.price || 0,
                                            });
                                        }
                                        let invItem = await models_1.InventoryItem.findOne({
                                            organizationId: req.tenantId,
                                            canonicalVariantId: variant._id,
                                        });
                                        if (!invItem) {
                                            const stock = Math.max(0, item.quantity || 0);
                                            invItem = await models_1.InventoryItem.create({
                                                organizationId: req.tenantId,
                                                canonicalVariantId: variant._id,
                                                sku: variant.sku,
                                                trackedStock: stock,
                                                reservedStock: 0,
                                                safetyStock: 0,
                                                availableToAllocate: stock,
                                                lowStockThreshold: 5,
                                            });
                                        }
                                        // Ensure 1:1 ProductMapping is active
                                        await models_1.ProductMapping.findOneAndUpdate({
                                            organizationId: req.tenantId,
                                            channelProductId: chProd._id,
                                        }, {
                                            $set: {
                                                canonicalProductId: canonicalProd._id,
                                                canonicalVariantId: variant._id,
                                                channelConnectionId: conn._id,
                                                channelProductId: chProd._id,
                                                channelType: shared_1.ChannelType.EBAY,
                                                mappingConfidence: shared_1.MappingConfidence.EXACT_SKU,
                                                syncPrice: true,
                                                syncInventory: true,
                                                status: shared_1.MappingStatus.MAPPED,
                                            },
                                            $unset: {
                                                unmappedAt: 1,
                                                unmappedReason: 1,
                                            },
                                        }, { upsert: true, new: true });
                                        syncedCount++;
                                    }
                                    // Reconcile and clean up stale channel products not present on eBay
                                    const allChannelProds = await models_1.ChannelProduct.find({
                                        organizationId: req.tenantId,
                                        channelConnectionId: conn._id,
                                    });
                                    const staleToClean = allChannelProds.filter((cp) => cp.sku && !activeSkus.has(cp.sku.toUpperCase().trim()));
                                    if (staleToClean.length > 0) {
                                        const staleIds = staleToClean.map((p) => p._id);
                                        await models_1.ChannelProduct.deleteMany({ _id: { $in: staleIds } });
                                        await models_1.ProductMapping.deleteMany({ channelProductId: { $in: staleIds } });
                                        logger_1.logger.info(`Reconciled and removed ${staleToClean.length} stale eBay products for ${conn.name}`);
                                    }
                                    conn.lastSyncAt = new Date();
                                    await conn.save();
                                    logger_1.logger.info(`Successfully imported ${syncedCount} eBay products for ${conn.name}`);
                                    if (syncedCount > 0) {
                                        await notification_service_1.NotificationService.notifyProductImported({
                                            organizationId: req.tenantId,
                                            channelName: conn.name,
                                            channelType: shared_1.ChannelType.EBAY,
                                            count: syncedCount,
                                        });
                                    }
                                }
                                catch (ebayErr) {
                                    logger_1.logger.error(`Failed to fetch eBay products for ${conn.name}: ${ebayErr.message}`);
                                }
                            }
                        }
                    }
                    // 2. INVENTORY_SYNC: Push platform stock levels to external channels
                    else if (jobType === shared_1.SyncJobType.INVENTORY_SYNC) {
                        const mappingsQuery = {
                            organizationId: req.tenantId,
                            status: shared_1.MappingStatus.MAPPED,
                            syncInventory: true,
                        };
                        if (connection) {
                            mappingsQuery.channelConnectionId = connection._id;
                        }
                        const mappings = await models_1.ProductMapping.find(mappingsQuery)
                            .populate('canonicalVariantId')
                            .populate('channelProductId')
                            .populate('channelConnectionId');
                        for (const mapping of mappings) {
                            const conn = mapping.channelConnectionId;
                            const chProd = mapping.channelProductId;
                            const variant = mapping.canonicalVariantId;
                            if (conn?.channelType === shared_1.ChannelType.SHOPIFY && chProd && variant) {
                                try {
                                    const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                                    const invItem = await models_1.InventoryItem.findOne({
                                        organizationId: req.tenantId,
                                        canonicalVariantId: variant._id,
                                    });
                                    const invItemId = chProd.rawPayload?.variant?.inventory_item_id;
                                    if (invItem && invItemId) {
                                        const success = await shopify_service_1.ShopifyService.setInventoryLevel(domain, token, String(invItemId), invItem.availableToAllocate);
                                        if (success) {
                                            chProd.inventoryQuantity = invItem.availableToAllocate;
                                            chProd.lastSyncedAt = new Date();
                                            await chProd.save();
                                            syncedCount++;
                                        }
                                    }
                                }
                                catch (invErr) {
                                    logger_1.logger.warn(`Failed to sync inventory for variant ${variant.sku}: ${invErr.message}`);
                                }
                            }
                            else if (conn?.channelType === shared_1.ChannelType.EBAY && chProd && variant) {
                                try {
                                    const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                                    const invItem = await models_1.InventoryItem.findOne({
                                        organizationId: req.tenantId,
                                        canonicalVariantId: variant._id,
                                    });
                                    if (invItem && chProd.sku) {
                                        const setResult = await ebay_service_1.EbayService.setInventoryItem(host, token, chProd.sku, {
                                            title: chProd.title,
                                            quantity: invItem.availableToAllocate,
                                            price: variant.retailPrice,
                                        });
                                        if (setResult?.success) {
                                            chProd.inventoryQuantity = invItem.availableToAllocate;
                                            chProd.lastSyncedAt = new Date();
                                            await chProd.save();
                                            syncedCount++;
                                        }
                                    }
                                }
                                catch (ebayInvErr) {
                                    logger_1.logger.warn(`Failed to sync eBay inventory for SKU ${chProd.sku}: ${ebayInvErr.message}`);
                                }
                            }
                        }
                        logger_1.logger.info(`Inventory sync finished. Synced ${syncedCount} items.`);
                    }
                    // 3. PRICE_SYNC: Push platform prices to external channels
                    else if (jobType === shared_1.SyncJobType.PRICE_SYNC) {
                        const mappingsQuery = {
                            organizationId: req.tenantId,
                            status: shared_1.MappingStatus.MAPPED,
                            syncPrice: true,
                        };
                        if (connection) {
                            mappingsQuery.channelConnectionId = connection._id;
                        }
                        const mappings = await models_1.ProductMapping.find(mappingsQuery)
                            .populate('canonicalVariantId')
                            .populate('channelProductId')
                            .populate('channelConnectionId');
                        for (const mapping of mappings) {
                            const conn = mapping.channelConnectionId;
                            const chProd = mapping.channelProductId;
                            const variant = mapping.canonicalVariantId;
                            if (conn?.channelType === shared_1.ChannelType.SHOPIFY && chProd?.externalVariantId && variant) {
                                try {
                                    const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                                    const success = await shopify_service_1.ShopifyService.updateVariantPrice(domain, token, chProd.externalVariantId, variant.retailPrice);
                                    if (success) {
                                        chProd.price = variant.retailPrice;
                                        chProd.lastSyncedAt = new Date();
                                        await chProd.save();
                                        syncedCount++;
                                    }
                                }
                                catch (priceErr) {
                                    logger_1.logger.warn(`Failed to sync price for variant ${variant.sku}: ${priceErr.message}`);
                                }
                            }
                            else if (conn?.channelType === shared_1.ChannelType.EBAY && chProd?.sku && variant) {
                                try {
                                    const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                                    const setResult = await ebay_service_1.EbayService.setInventoryItem(host, token, chProd.sku, {
                                        title: chProd.title,
                                        quantity: chProd.inventoryQuantity || 0,
                                        price: variant.retailPrice,
                                    });
                                    if (setResult?.success) {
                                        chProd.price = variant.retailPrice;
                                        chProd.lastSyncedAt = new Date();
                                        await chProd.save();
                                        syncedCount++;
                                    }
                                }
                                catch (ebayPriceErr) {
                                    logger_1.logger.warn(`Failed to sync eBay price for SKU ${chProd.sku}: ${ebayPriceErr.message}`);
                                }
                            }
                        }
                        logger_1.logger.info(`Price sync finished. Synced ${syncedCount} items.`);
                    }
                    syncJob.status = shared_1.SyncJobStatus.COMPLETED;
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
                }
                catch (e) {
                    logger_1.logger.error('Background sync job error:', e);
                    syncJob.status = shared_1.SyncJobStatus.FAILED;
                    syncJob.errorMessage = e.message;
                    await syncJob.save();
                }
            }, 300);
            logger_1.logger.info(`Sync job dispatched: ${jobType} (Job: ${syncJob._id})`);
            return res.status(202).json({
                success: true,
                data: syncJob,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to trigger sync' },
            });
        }
    }
    // POST /api/v1/sync/import-to-canonical - Import products from external channels directly into Canonical Master Catalog
    static async importToCanonical(req, res) {
        try {
            const { channelConnectionId, forceReimport = false } = req.body;
            const connQuery = {
                organizationId: req.tenantId,
                status: shared_1.ChannelStatus.ACTIVE,
            };
            if (channelConnectionId) {
                connQuery._id = channelConnectionId;
            }
            const connections = await models_1.ChannelConnection.find(connQuery);
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
                if (conn.channelType === shared_1.ChannelType.SHOPIFY) {
                    try {
                        const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                        const prods = await shopify_service_1.ShopifyService.fetchAllProducts(domain, token);
                        // Auto-ensure webhooks are registered to deliver updates
                        shopify_service_1.ShopifyService.registerWebhooks(domain, token, conn._id.toString()).catch((e) => logger_1.logger.warn(`Could not register webhooks during importToCanonical: ${e.message}`));
                        for (const prod of prods) {
                            for (const variant of prod.variants || []) {
                                await models_1.ChannelProduct.findOneAndUpdate({
                                    organizationId: req.tenantId,
                                    channelConnectionId: conn._id,
                                    externalProductId: String(prod.id),
                                    externalVariantId: String(variant.id),
                                }, {
                                    channelType: shared_1.ChannelType.SHOPIFY,
                                    title: prod.title + (variant.title && variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
                                    sku: (variant.sku && variant.sku.trim()) || `SHOPIFY-${variant.id}`,
                                    barcode: variant.barcode || '',
                                    price: parseFloat(variant.price) || 0,
                                    inventoryQuantity: variant.inventory_quantity || 0,
                                    status: shared_1.ChannelProductStatus.ACTIVE,
                                    syncStatus: shared_1.SyncStatus.SYNCED,
                                    lastSyncedAt: new Date(),
                                    rawPayload: { product: prod, variant },
                                }, { upsert: true, new: true });
                            }
                        }
                    }
                    catch (fetchErr) {
                        logger_1.logger.warn(`Could not refresh Shopify channel catalog directly: ${fetchErr.message}`);
                    }
                }
                else if (conn.channelType === shared_1.ChannelType.EBAY) {
                    try {
                        const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                        const items = await ebay_service_1.EbayService.getInventoryItems(host, token, 100, conn);
                        const activeSkus = new Set();
                        for (const item of items) {
                            if (!item.sku)
                                continue;
                            activeSkus.add(item.sku.toUpperCase().trim());
                            const listingId = item.listingId || item.sku;
                            await models_1.ChannelProduct.findOneAndUpdate({
                                organizationId: req.tenantId,
                                channelConnectionId: conn._id,
                                sku: item.sku.toUpperCase().trim(),
                            }, {
                                channelType: shared_1.ChannelType.EBAY,
                                externalProductId: listingId,
                                externalVariantId: item.sku,
                                title: item.title,
                                sku: item.sku ? item.sku.toUpperCase().trim() : undefined,
                                barcode: '',
                                price: item.price || 0,
                                inventoryQuantity: item.quantity || 0,
                                status: shared_1.ChannelProductStatus.ACTIVE,
                                syncStatus: shared_1.SyncStatus.SYNCED,
                                lastSyncedAt: new Date(),
                                rawPayload: {
                                    ebayItem: item.raw,
                                    images: item.images,
                                    description: item.description,
                                    listingId,
                                    offerId: item.offerId,
                                },
                            }, { upsert: true, new: true });
                        }
                        // Clean up stale channel products not present on eBay
                        const allConnProds = await models_1.ChannelProduct.find({
                            organizationId: req.tenantId,
                            channelConnectionId: conn._id,
                        });
                        const staleProds = allConnProds.filter((cp) => cp.sku && !activeSkus.has(cp.sku.toUpperCase().trim()));
                        if (staleProds.length > 0) {
                            const staleIds = staleProds.map((p) => p._id);
                            await models_1.ChannelProduct.deleteMany({ _id: { $in: staleIds } });
                            await models_1.ProductMapping.deleteMany({ channelProductId: { $in: staleIds } });
                        }
                    }
                    catch (fetchErr) {
                        logger_1.logger.warn(`Could not refresh eBay channel catalog directly: ${fetchErr.message}`);
                    }
                }
                const channelProducts = await models_1.ChannelProduct.find({
                    organizationId: req.tenantId,
                    channelConnectionId: conn._id,
                });
                // Group channel products by externalProductId
                const productMap = new Map();
                for (const cp of channelProducts) {
                    const extId = cp.externalProductId || String(cp._id);
                    if (!productMap.has(extId)) {
                        productMap.set(extId, []);
                    }
                    productMap.get(extId).push(cp);
                }
                for (const [extId, items] of productMap.entries()) {
                    const firstItem = items[0];
                    const rawProd = firstItem.rawPayload?.product;
                    const baseTitle = rawProd?.title || firstItem.title.split(' - ')[0] || firstItem.title;
                    const prefix = conn.channelType === shared_1.ChannelType.EBAY ? 'EBAY' : 'SH';
                    const masterSku = (firstItem.sku || `${prefix}-${extId}`).toUpperCase().trim();
                    // Transform images to match CanonicalProduct embedded schema: [{ url, altText, position, isPrimary }]
                    let images = [];
                    if (conn.channelType === shared_1.ChannelType.EBAY) {
                        const rawImgUrls = firstItem.rawPayload?.images || [];
                        images = rawImgUrls.map((url, idx) => ({
                            url,
                            altText: baseTitle,
                            position: idx,
                            isPrimary: idx === 0,
                        })).filter((img) => img.url && typeof img.url === 'string' && img.url.trim().length > 0);
                    }
                    else {
                        const rawImages = rawProd?.images && Array.isArray(rawProd.images) && rawProd.images.length > 0
                            ? rawProd.images
                            : rawProd?.image
                                ? [rawProd.image]
                                : [];
                        images = (Array.isArray(rawImages) ? rawImages : [rawImages])
                            .map((img, idx) => {
                            const url = typeof img === 'string' ? img : img?.src || img?.url || '';
                            return {
                                url,
                                altText: typeof img === 'object' ? img?.alt || '' : '',
                                position: typeof img === 'object' && typeof img?.position === 'number' ? img.position : idx,
                                isPrimary: idx === 0,
                            };
                        })
                            .filter((img) => img.url && typeof img.url === 'string' && img.url.trim().length > 0);
                    }
                    const rawTags = rawProd?.tags || [];
                    const tags = Array.isArray(rawTags)
                        ? rawTags
                        : typeof rawTags === 'string'
                            ? rawTags.split(',').map((t) => t.trim()).filter(Boolean)
                            : [];
                    const description = conn.channelType === shared_1.ChannelType.EBAY
                        ? (firstItem.rawPayload?.description || '')
                        : (rawProd?.body_html || '');
                    const brand = conn.channelType === shared_1.ChannelType.EBAY
                        ? 'eBay'
                        : (rawProd?.vendor || 'Shopify');
                    const category = conn.channelType === shared_1.ChannelType.EBAY
                        ? 'General'
                        : (rawProd?.product_type || 'General');
                    // Check if CanonicalProduct with masterSku or title already exists
                    let canonicalProduct = await models_1.CanonicalProduct.findOne({
                        organizationId: req.tenantId,
                        $or: [{ masterSku }, { title: baseTitle }],
                    });
                    if (canonicalProduct) {
                        alreadyImportedProductsCount++;
                        let hasProductChanged = false;
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
                        if (firstItem.price !== undefined && firstItem.price > 0 && canonicalProduct.defaultRetailPrice !== firstItem.price) {
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
                    }
                    else {
                        canonicalProduct = await models_1.CanonicalProduct.create({
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
                            status: shared_1.ProductStatus.ACTIVE,
                        });
                        newlyImportedProductsCount++;
                    }
                    // Process variants for this product
                    for (const item of items) {
                        const variantSku = (item.sku || `${prefix}-VAR-${item.externalVariantId || item.externalProductId}`).toUpperCase().trim();
                        let variant = await models_1.ProductVariant.findOne({
                            organizationId: req.tenantId,
                            canonicalProductId: canonicalProduct._id,
                            sku: variantSku,
                        });
                        if (variant) {
                            let hasVarChanged = false;
                            if (item.price !== undefined && variant.retailPrice !== item.price) {
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
                            const invItem = await models_1.InventoryItem.findOne({
                                organizationId: req.tenantId,
                                canonicalVariantId: variant._id,
                            });
                            if (invItem && typeof item.inventoryQuantity === 'number') {
                                const safeStock = Math.max(0, item.inventoryQuantity);
                                if (invItem.trackedStock !== safeStock || forceReimport) {
                                    invItem.trackedStock = safeStock;
                                    invItem.availableToAllocate = Math.max(0, safeStock - invItem.reservedStock - invItem.safetyStock);
                                    await invItem.save();
                                }
                            }
                        }
                        else {
                            const rawVar = item.rawPayload?.variant;
                            const varTitle = rawVar?.title && rawVar.title !== 'Default Title' ? rawVar.title : item.title;
                            variant = await models_1.ProductVariant.create({
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
                            await models_1.InventoryItem.create({
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
                                await models_1.InventoryMovement.create({
                                    organizationId: req.tenantId,
                                    canonicalVariantId: variant._id,
                                    changeType: shared_1.InventoryChangeType.RESTOCK,
                                    quantityChanged: stock,
                                    previousTrackedStock: 0,
                                    newTrackedStock: stock,
                                    reason: `Imported from ${conn.name} (${conn.channelType}) catalog`,
                                    performedBy: req.user?.userId,
                                });
                            }
                            newlyImportedVariantsCount++;
                        }
                        // Create/update 1:1 ProductMapping
                        await models_1.ProductMapping.findOneAndUpdate({
                            organizationId: req.tenantId,
                            channelProductId: item._id,
                        }, {
                            canonicalProductId: canonicalProduct._id,
                            canonicalVariantId: variant._id,
                            channelConnectionId: conn._id,
                            channelProductId: item._id,
                            channelType: conn.channelType,
                            mappingConfidence: shared_1.MappingConfidence.EXACT_SKU,
                            syncPrice: true,
                            syncInventory: true,
                            status: shared_1.MappingStatus.MAPPED,
                        }, { upsert: true, new: true });
                        mappedCount++;
                    }
                }
            }
            const channelLabel = connections.length === 1 ? `${connections[0].name} (${connections[0].channelType})` : 'your connected stores';
            const alreadyImported = newlyImportedProductsCount === 0 && alreadyImportedProductsCount > 0 && !forceReimport && updatedProductsCount === 0;
            logger_1.logger.info(`Import summary for ${channelLabel}: ${newlyImportedProductsCount} new products, ${alreadyImportedProductsCount} already existing, ${updatedProductsCount} updated products, ${newlyImportedVariantsCount} new variants, ${mappedCount} mappings.`);
            let responseMessage = '';
            if (newlyImportedProductsCount > 0) {
                responseMessage = `Successfully imported ${newlyImportedProductsCount} new products (${newlyImportedVariantsCount} variants) from ${channelLabel} into Master Catalog!`;
            }
            else if (updatedProductsCount > 0) {
                responseMessage = `Successfully synchronized ${updatedProductsCount} products with latest prices and stock from ${channelLabel}!`;
            }
            else {
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
        }
        catch (error) {
            logger_1.logger.error('Failed to import products to master catalog:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to import products to canonical catalog' },
            });
        }
    }
    // POST /api/v1/sync/jobs/:id/retry - Retry a failed sync job
    static async retryJob(req, res) {
        try {
            const { id } = req.params;
            const job = await models_1.SyncJob.findOne({
                _id: id,
                organizationId: req.tenantId,
            });
            if (!job) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Sync job not found', code: 'NOT_FOUND' },
                });
            }
            job.status = shared_1.SyncJobStatus.QUEUED;
            job.attemptCount += 1;
            job.errorMessage = undefined;
            await job.save();
            return res.json({
                success: true,
                data: job,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to retry sync job' },
            });
        }
    }
}
exports.SyncController = SyncController;
//# sourceMappingURL=sync.controller.js.map