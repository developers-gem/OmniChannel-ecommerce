"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const database_1 = require("../../database");
const logger_1 = require("../../utils/logger");
const shopify_service_1 = require("../../services/shopify.service");
const ebay_service_1 = require("../../services/ebay.service");
const notification_service_1 = require("../../services/notification.service");
class ProductsController {
    // GET /api/v1/products - List canonical products with pagination, search, and variant count
    static async list(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const search = req.query.search || '';
            const status = req.query.status;
            const query = { organizationId: req.tenantId };
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
            const total = await models_1.CanonicalProduct.countDocuments(query);
            const products = await models_1.CanonicalProduct.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            // Enrich with variants and mapping count
            const productIds = products.map((p) => p._id);
            const variants = await models_1.ProductVariant.find({
                canonicalProductId: { $in: productIds },
            }).lean();
            const variantIds = variants.map((v) => v._id);
            const inventoryItems = await models_1.InventoryItem.find({
                canonicalVariantId: { $in: variantIds },
            }).lean();
            const mappings = await models_1.ProductMapping.find({
                canonicalProductId: { $in: productIds },
            }).lean();
            const enrichedProducts = products.map((prod) => {
                const prodVariants = variants.filter((v) => v.canonicalProductId.toString() === prod._id.toString());
                const mappedCount = mappings.filter((m) => m.canonicalProductId.toString() === prod._id.toString() &&
                    m.status === shared_1.MappingStatus.MAPPED).length;
                const unmappedCount = mappings.filter((m) => m.canonicalProductId.toString() === prod._id.toString() &&
                    m.status === shared_1.MappingStatus.UNMAPPED).length;
                const totalStock = prodVariants.reduce((sum, v) => {
                    const inv = inventoryItems.find((i) => i.canonicalVariantId.toString() === v._id.toString());
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
        }
        catch (error) {
            logger_1.logger.error('Failed to list products:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list products' },
            });
        }
    }
    // GET /api/v1/products/:id - Get single canonical product details with variants, inventory, and mapped channels
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const product = await models_1.CanonicalProduct.findOne({
                _id: id,
                organizationId: req.tenantId,
            }).lean();
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Product not found', code: 'NOT_FOUND' },
                });
            }
            const variants = await models_1.ProductVariant.find({
                canonicalProductId: product._id,
            }).lean();
            const variantIds = variants.map((v) => v._id);
            const inventoryItems = await models_1.InventoryItem.find({
                canonicalVariantId: { $in: variantIds },
            }).lean();
            const mappings = await models_1.ProductMapping.find({
                canonicalProductId: product._id,
            })
                .populate('channelConnectionId', 'name channelType')
                .populate('channelProductId')
                .lean();
            const enrichedVariants = variants.map((v) => {
                const inv = inventoryItems.find((i) => i.canonicalVariantId.toString() === v._id.toString());
                const variantMappings = mappings.filter((m) => m.canonicalVariantId.toString() === v._id.toString());
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch product' },
            });
        }
    }
    // POST /api/v1/products - Create a canonical product with variants and initial inventory
    static async create(req, res) {
        try {
            const { title, masterSku, description, brand, category, tags, images, defaultCostPrice, defaultRetailPrice, variants, } = req.body;
            // Duplicate masterSku check
            const existingProduct = await models_1.CanonicalProduct.findOne({
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
            const { product, createdVariants } = await (0, database_1.runInTransaction)(async (session) => {
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
                const [prod] = await models_1.CanonicalProduct.create([
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
                        status: shared_1.ProductStatus.ACTIVE,
                    },
                ], opts);
                // Create Variants and Initial Inventory
                const variantList = [];
                for (const v of effectiveVariants) {
                    const [variant] = await models_1.ProductVariant.create([
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
                    ], opts);
                    // Cost History initial entry
                    await models_1.ProductCostHistory.create([
                        {
                            organizationId: req.tenantId,
                            canonicalVariantId: variant._id,
                            costPrice: variant.costPrice,
                            effectiveFrom: new Date(),
                            reason: 'Initial creation',
                        },
                    ], opts);
                    // Initial Inventory record
                    const initialStock = v.initialStock || 0;
                    const [invItem] = await models_1.InventoryItem.create([
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
                    ], opts);
                    if (initialStock > 0) {
                        await models_1.InventoryMovement.create([
                            {
                                organizationId: req.tenantId,
                                canonicalVariantId: variant._id,
                                changeType: shared_1.InventoryChangeType.RESTOCK,
                                quantityChanged: initialStock,
                                previousTrackedStock: 0,
                                newTrackedStock: initialStock,
                                reason: 'Initial stock intake upon product creation',
                                performedBy: req.user?.userId,
                            },
                        ], opts);
                    }
                    variantList.push({ ...variant.toObject(), inventory: invItem });
                }
                return { product: prod, createdVariants: variantList };
            });
            // Check for auto-mapping signals with existing unmapped channel products (exact SKU or Barcode)
            for (const variant of createdVariants) {
                const match = await models_1.ChannelProduct.findOne({
                    organizationId: req.tenantId,
                    sku: variant.sku,
                });
                if (match) {
                    const alreadyMapped = await models_1.ProductMapping.findOne({
                        organizationId: req.tenantId,
                        channelProductId: match._id,
                    });
                    if (!alreadyMapped) {
                        await models_1.ProductMapping.create({
                            organizationId: req.tenantId,
                            canonicalProductId: product._id,
                            canonicalVariantId: variant._id,
                            channelConnectionId: match.channelConnectionId,
                            channelProductId: match._id,
                            channelType: match.channelType,
                            mappingConfidence: shared_1.MappingConfidence.EXACT_SKU,
                            syncPrice: true,
                            syncInventory: true,
                        });
                        logger_1.logger.info(`Auto-mapped variant SKU ${variant.sku} to channel product ${match._id}`);
                    }
                }
            }
            logger_1.logger.info(`Product created: ${product.title} (SKU: ${product.masterSku})`);
            return res.status(201).json({
                success: true,
                data: {
                    ...product.toObject(),
                    variants: createdVariants,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to create product:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create product' },
            });
        }
    }
    // PUT /api/v1/products/:id - Update product details
    static async update(req, res) {
        try {
            const { id } = req.params;
            const { title, description, brand, category, tags, images, status, defaultCostPrice, defaultRetailPrice } = req.body;
            const product = await models_1.CanonicalProduct.findOneAndUpdate({ _id: id, organizationId: req.tenantId }, {
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
            }, { new: true });
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Product not found', code: 'NOT_FOUND' },
                });
            }
            await notification_service_1.NotificationService.notifyProductModified({
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update product' },
            });
        }
    }
    // DELETE /api/v1/products/:id - Archive or delete product and safely unmap
    static async delete(req, res) {
        try {
            const { id } = req.params;
            const product = await models_1.CanonicalProduct.findOne({
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
            await models_1.ProductMapping.deleteMany({
                organizationId: req.tenantId,
                canonicalProductId: product._id,
            });
            // Archive product
            product.status = shared_1.ProductStatus.ARCHIVED;
            await product.save();
            return res.json({
                success: true,
                data: { message: 'Product successfully archived and unmapped from all channels' },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to archive product' },
            });
        }
    }
    // GET /api/v1/products/summary-counts - Returns unified catalog and multi-store channel statistics
    static async getSummaryCounts(req, res) {
        try {
            const tenantId = req.tenantId;
            const tenantOrgId = tenantId && mongoose_1.default.Types.ObjectId.isValid(tenantId)
                ? new mongoose_1.default.Types.ObjectId(tenantId)
                : tenantId;
            const [totalMasterProducts, totalVariants, activeChannels, activeMappings, storeProductCountsAgg, listingCountsAgg, mappedCountsAgg,] = await Promise.all([
                models_1.CanonicalProduct.countDocuments({ organizationId: tenantId }),
                models_1.ProductVariant.countDocuments({ organizationId: tenantId }),
                models_1.ChannelConnection.find({ organizationId: tenantId, status: shared_1.ChannelStatus.ACTIVE }).lean(),
                models_1.ProductMapping.find({ organizationId: tenantId, status: shared_1.MappingStatus.MAPPED }, { canonicalProductId: 1, channelConnectionId: 1 }).lean(),
                models_1.ChannelProduct.aggregate([
                    { $match: { organizationId: tenantOrgId || tenantId } },
                    {
                        $group: {
                            _id: {
                                channelConnectionId: '$channelConnectionId',
                                externalProductId: '$externalProductId',
                            },
                        },
                    },
                    {
                        $group: {
                            _id: '$_id.channelConnectionId',
                            totalStoreProducts: { $sum: 1 },
                        },
                    },
                ]),
                models_1.ChannelProduct.aggregate([
                    { $match: { organizationId: tenantOrgId || tenantId } },
                    { $group: { _id: '$channelConnectionId', totalListings: { $sum: 1 } } },
                ]),
                models_1.ProductMapping.aggregate([
                    { $match: { organizationId: tenantOrgId || tenantId, status: shared_1.MappingStatus.MAPPED } },
                    { $group: { _id: '$channelConnectionId', totalMapped: { $sum: 1 } } },
                ]),
            ]);
            const channelBreakdown = {};
            const channelCanonicalProdsMap = {};
            for (const ch of activeChannels) {
                const chIdStr = ch._id.toString();
                const storeProds = storeProductCountsAgg.find((s) => s._id?.toString() === chIdStr)?.totalStoreProducts || 0;
                const listings = listingCountsAgg.find((l) => l._id?.toString() === chIdStr)?.totalListings || 0;
                const mapped = mappedCountsAgg.find((m) => m._id?.toString() === chIdStr)?.totalMapped || 0;
                channelBreakdown[chIdStr] = {
                    channelId: chIdStr,
                    channelName: ch.name,
                    channelType: ch.channelType,
                    storeProductsCount: storeProds,
                    productsCount: storeProds || listings,
                    listingsCount: listings,
                    mappedCount: mapped,
                    mappedCanonicalCount: 0,
                    mappedPercentage: listings > 0 ? Math.round((mapped / listings) * 100) : 0,
                };
                channelCanonicalProdsMap[chIdStr] = new Set();
            }
            const mappedCanonicalIds = new Set();
            const prodToChannelMap = new Map();
            for (const m of activeMappings) {
                const prodId = m.canonicalProductId?.toString();
                const chId = m.channelConnectionId?.toString();
                if (prodId) {
                    mappedCanonicalIds.add(prodId);
                    if (chId && channelCanonicalProdsMap[chId]) {
                        channelCanonicalProdsMap[chId].add(prodId);
                    }
                    if (chId) {
                        if (!prodToChannelMap.has(prodId)) {
                            prodToChannelMap.set(prodId, new Set());
                        }
                        prodToChannelMap.get(prodId).add(chId);
                    }
                }
            }
            for (const chId in channelCanonicalProdsMap) {
                if (channelBreakdown[chId]) {
                    channelBreakdown[chId].mappedCanonicalCount = channelCanonicalProdsMap[chId].size;
                }
            }
            // Products with strictly 0 active mappings (added in platform, not on any channel)
            const zeroMappedProducts = Math.max(0, totalMasterProducts - mappedCanonicalIds.size);
            // Incomplete mapped products (mapped to at least 1 channel, but missing at least 1 active channel)
            let incompleteMappedProducts = 0;
            if (activeChannels.length > 1) {
                for (const chSet of prodToChannelMap.values()) {
                    if (chSet.size > 0 && chSet.size < activeChannels.length) {
                        incompleteMappedProducts++;
                    }
                }
            }
            const shopifyChannels = activeChannels.filter((c) => c.channelType === shared_1.ChannelType.SHOPIFY);
            const ebayChannels = activeChannels.filter((c) => c.channelType === shared_1.ChannelType.EBAY);
            const buildChannelStats = (channels, defaultName, channelTypeStr) => {
                if (channels.length === 0) {
                    return {
                        channelId: '',
                        channelName: defaultName,
                        channelType: channelTypeStr,
                        storeProductsCount: 0,
                        productsCount: 0,
                        listingsCount: 0,
                        mappedCount: 0,
                        mappedCanonicalCount: 0,
                        mappedPercentage: 0,
                    };
                }
                let storeProductsCount = 0;
                let listingsCount = 0;
                let mappedCount = 0;
                const unionCanonicalProdIds = new Set();
                for (const ch of channels) {
                    const b = channelBreakdown[ch._id.toString()];
                    if (b) {
                        storeProductsCount += b.storeProductsCount;
                        listingsCount += b.listingsCount;
                        mappedCount += b.mappedCount;
                    }
                    for (const pid of channelCanonicalProdsMap[ch._id.toString()] || []) {
                        unionCanonicalProdIds.add(pid);
                    }
                }
                const mappedPercentage = listingsCount > 0 ? Math.round((mappedCount / listingsCount) * 100) : 0;
                return {
                    channelId: channels[0]._id.toString(),
                    channelName: channels.length > 1 ? `${defaultName} (${channels.length} Stores)` : channels[0].name,
                    channelType: channelTypeStr,
                    storeProductsCount,
                    productsCount: storeProductsCount || listingsCount,
                    listingsCount,
                    mappedCount,
                    mappedCanonicalCount: unionCanonicalProdIds.size,
                    mappedPercentage,
                };
            };
            const shopifyStats = buildChannelStats(shopifyChannels, 'Shopify', 'SHOPIFY');
            const ebayStats = buildChannelStats(ebayChannels, 'eBay', 'EBAY');
            return res.json({
                success: true,
                data: {
                    totalMasterProducts,
                    totalVariants,
                    totalTrackedSkus: totalVariants,
                    totalMappings: activeMappings.length,
                    zeroMappedProducts,
                    incompleteMappedProducts,
                    totalNeedsMapping: zeroMappedProducts + incompleteMappedProducts,
                    channelBreakdown,
                    shopify: shopifyStats,
                    ebay: ebayStats,
                    activeChannelsCount: activeChannels.length,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get summary counts:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch catalog summary counts' },
            });
        }
    }
    // GET /api/v1/products/zero-mapped - List all canonical products with 0 active mappings or unmapped from channels
    static async listZeroMapped(req, res) {
        try {
            const search = req.query.search || '';
            const filter = req.query.filter || 'all';
            const activeChannels = await models_1.ChannelConnection.find({
                organizationId: req.tenantId,
                status: shared_1.ChannelStatus.ACTIVE,
            }).lean();
            const prodQuery = { organizationId: req.tenantId };
            if (search) {
                prodQuery.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { masterSku: { $regex: search, $options: 'i' } },
                    { brand: { $regex: search, $options: 'i' } },
                ];
            }
            const products = await models_1.CanonicalProduct.find(prodQuery)
                .sort({ createdAt: -1 })
                .lean();
            const productIds = products.map((p) => p._id);
            const variants = await models_1.ProductVariant.find({
                canonicalProductId: { $in: productIds },
                organizationId: req.tenantId,
            }).lean();
            const variantIds = variants.map((v) => v._id);
            const inventoryItems = await models_1.InventoryItem.find({
                canonicalVariantId: { $in: variantIds },
                organizationId: req.tenantId,
            }).lean();
            const mappings = await models_1.ProductMapping.find({
                canonicalProductId: { $in: productIds },
                organizationId: req.tenantId,
            })
                .populate('channelConnectionId', 'name channelType status')
                .lean();
            const enrichedList = [];
            for (const prod of products) {
                const prodVariants = variants.filter((v) => v.canonicalProductId.toString() === prod._id.toString());
                const prodMappings = mappings.filter((m) => m.canonicalProductId.toString() === prod._id.toString());
                const activeMapped = prodMappings.filter((m) => m.status === shared_1.MappingStatus.MAPPED);
                const unmapped = prodMappings.filter((m) => m.status === shared_1.MappingStatus.UNMAPPED);
                const totalStock = prodVariants.reduce((sum, v) => {
                    const inv = inventoryItems.find((i) => i.canonicalVariantId.toString() === v._id.toString());
                    return sum + (inv?.trackedStock || 0);
                }, 0);
                const unmappedFrom = unmapped.map((m) => ({
                    channelConnectionId: m.channelConnectionId?._id || m.channelConnectionId,
                    channelName: m.channelConnectionId?.name || 'Store',
                    channelType: m.channelConnectionId?.channelType || m.channelType,
                    unmappedAt: m.unmappedAt || m.updatedAt,
                    unmappedReason: m.unmappedReason || 'Unmapped from product mapping page',
                }));
                const activeChannelsList = activeMapped.map((m) => ({
                    channelConnectionId: m.channelConnectionId?._id || m.channelConnectionId,
                    channelName: m.channelConnectionId?.name || 'Store',
                    channelType: m.channelConnectionId?.channelType || m.channelType,
                }));
                const activeChannelIdSet = new Set(activeChannelsList.map((c) => String(c.channelConnectionId)));
                const availableChannels = activeChannels.map((c) => {
                    const isMapped = activeChannelIdSet.has(String(c._id));
                    const wasUnmapped = unmapped.some((u) => String(u.channelConnectionId?._id || u.channelConnectionId) === String(c._id));
                    return {
                        channelConnectionId: c._id,
                        channelName: c.name,
                        channelType: c.channelType,
                        isMapped,
                        isPreviouslyUnmapped: wasUnmapped,
                    };
                });
                const isZeroMapped = activeMapped.length === 0;
                const missingChannels = availableChannels.filter((c) => !c.isMapped);
                const isPartiallyMapped = activeMapped.length > 0 && missingChannels.length > 0;
                // Include all products that have 0 active mappings OR have unmapped channel records OR missing channels
                if (isZeroMapped || isPartiallyMapped || unmapped.length > 0) {
                    enrichedList.push({
                        ...prod,
                        variants: prodVariants,
                        totalStock,
                        activeMappedCount: activeMapped.length,
                        isZeroMapped,
                        isPartiallyMapped,
                        missingChannels,
                        unmappedFrom,
                        activeChannels: activeChannelsList,
                        availableChannels,
                    });
                }
            }
            let finalList = enrichedList;
            if (filter === 'zero_only') {
                finalList = enrichedList.filter((p) => p.isZeroMapped);
            }
            else if (filter === 'missing_ebay') {
                finalList = enrichedList.filter((p) => p.missingChannels?.some((c) => c.channelType === shared_1.ChannelType.EBAY));
            }
            else if (filter === 'missing_shopify') {
                finalList = enrichedList.filter((p) => p.missingChannels?.some((c) => c.channelType === shared_1.ChannelType.SHOPIFY));
            }
            else if (filter === 'unmapped_only') {
                finalList = enrichedList.filter((p) => (p.unmappedFrom || []).length > 0);
            }
            return res.json({
                success: true,
                data: finalList,
                totalZeroMapped: enrichedList.filter((p) => p.isZeroMapped).length,
                totalPartiallyMapped: enrichedList.filter((p) => p.isPartiallyMapped).length,
                totalWithUnmappedChannels: enrichedList.length,
                activeChannels: activeChannels.map((c) => ({
                    id: c._id,
                    name: c.name,
                    channelType: c.channelType,
                })),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to list 0-mapped products:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list 0-mapped products' },
            });
        }
    }
    // POST /api/v1/products/:id/publish - Push/publish a canonical product to connected channels (Shopify, etc.)
    static async publish(req, res) {
        try {
            const { id } = req.params;
            const { channelConnectionId, channelConnectionIds, forceRepublish, markupPercent, channelMarkups, } = req.body;
            const product = await models_1.CanonicalProduct.findOne({
                _id: id,
                organizationId: req.tenantId,
            });
            if (!product) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Product not found', code: 'NOT_FOUND' },
                });
            }
            const variants = await models_1.ProductVariant.find({
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
            const inventoryItems = await models_1.InventoryItem.find({
                canonicalVariantId: { $in: variantIds },
                organizationId: req.tenantId,
            });
            // Find channel connections
            const connQuery = {
                organizationId: req.tenantId,
                status: shared_1.ChannelStatus.ACTIVE,
            };
            const targetIds = Array.isArray(channelConnectionIds) && channelConnectionIds.length > 0
                ? channelConnectionIds
                : (channelConnectionId ? (Array.isArray(channelConnectionId) ? channelConnectionId : [channelConnectionId]) : null);
            if (targetIds && targetIds.length > 0) {
                connQuery._id = { $in: targetIds };
            }
            const connections = await models_1.ChannelConnection.find(connQuery);
            if (connections.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'No active sales channels found to publish to' },
                });
            }
            // Check if product is already mapped to the target channel (avoid duplicate pushing/mapping)
            if (connections.length === 1 && !forceRepublish) {
                const existingMappings = await models_1.ProductMapping.find({
                    organizationId: req.tenantId,
                    canonicalProductId: product._id,
                    channelConnectionId: connections[0]._id,
                    status: shared_1.MappingStatus.MAPPED,
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
            const results = [];
            for (const conn of connections) {
                const chIdStr = conn._id.toString();
                const feePercent = typeof channelMarkups?.[chIdStr] === 'number'
                    ? channelMarkups[chIdStr]
                    : (typeof markupPercent === 'number' ? markupPercent : 0);
                if (conn.channelType === shared_1.ChannelType.SHOPIFY) {
                    try {
                        const { domain, token } = shopify_service_1.ShopifyService.getCredentials(conn);
                        // Format variants with current stock and adjusted retail price (platform price + channel platform charge)
                        const variantPayload = variants.map((v) => {
                            const inv = inventoryItems.find((i) => i.canonicalVariantId.toString() === v._id.toString());
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
                        const existingMapping = await models_1.ProductMapping.findOne({
                            organizationId: req.tenantId,
                            canonicalProductId: product._id,
                            channelConnectionId: conn._id,
                        }).populate('channelProductId');
                        const existingChProd = existingMapping?.channelProductId;
                        let shopifyProduct = null;
                        if (existingChProd?.externalProductId) {
                            try {
                                shopifyProduct = await shopify_service_1.ShopifyService.updateProduct(domain, token, existingChProd.externalProductId, {
                                    title: product.title,
                                    description: product.description,
                                    brand: product.brand,
                                    category: product.category,
                                    tags: product.tags,
                                    images: (product.images || []).map((img) => typeof img === 'string' ? img : img.url),
                                });
                            }
                            catch (updErr) {
                                logger_1.logger.warn(`Could not update existing Shopify product ${existingChProd.externalProductId}, falling back to publish: ${updErr.message}`);
                            }
                        }
                        if (!shopifyProduct) {
                            shopifyProduct = await shopify_service_1.ShopifyService.publishProduct(domain, token, {
                                title: product.title,
                                description: product.description,
                                brand: product.brand,
                                category: product.category,
                                tags: product.tags,
                                images: (product.images || []).map((img) => typeof img === 'string' ? img : img.url),
                                variants: variantPayload,
                            });
                        }
                        else {
                            // Also update variant price & inventory for existing Shopify product
                            for (let i = 0; i < variants.length; i++) {
                                const srcVariant = variants[i];
                                const shVariant = shopifyProduct.variants?.[i] || shopifyProduct.variants?.[0];
                                if (shVariant) {
                                    const basePrice = typeof srcVariant.retailPrice === 'number' ? srcVariant.retailPrice : (product.defaultRetailPrice || 0);
                                    const finalPrice = feePercent > 0
                                        ? Math.round(basePrice * (1 + feePercent / 100) * 100) / 100
                                        : basePrice;
                                    await shopify_service_1.ShopifyService.updateVariantPrice(domain, token, String(shVariant.id), finalPrice);
                                    const inv = inventoryItems.find((invItem) => invItem.canonicalVariantId.toString() === srcVariant._id.toString());
                                    if (shVariant.inventory_item_id && inv) {
                                        await shopify_service_1.ShopifyService.setInventoryLevel(domain, token, String(shVariant.inventory_item_id), inv.trackedStock || 0);
                                    }
                                }
                            }
                        }
                        // For each created/updated variant on Shopify, create/update ChannelProduct and ProductMapping
                        const createdMappings = [];
                        for (let i = 0; i < variants.length; i++) {
                            const platformVariant = variants[i];
                            const shVariant = shopifyProduct.variants?.[i] || shopifyProduct.variants?.[0];
                            if (shVariant) {
                                const channelProd = await models_1.ChannelProduct.findOneAndUpdate({
                                    organizationId: req.tenantId,
                                    channelConnectionId: conn._id,
                                    externalProductId: String(shopifyProduct.id),
                                    externalVariantId: String(shVariant.id),
                                }, {
                                    channelType: shared_1.ChannelType.SHOPIFY,
                                    title: `${shopifyProduct.title} - ${shVariant.title}`,
                                    sku: shVariant.sku || platformVariant.sku,
                                    barcode: shVariant.barcode || platformVariant.barcode || '',
                                    price: parseFloat(shVariant.price) || platformVariant.retailPrice,
                                    inventoryQuantity: shVariant.inventory_quantity || 0,
                                    status: shared_1.ChannelProductStatus.ACTIVE,
                                    syncStatus: shared_1.SyncStatus.SYNCED,
                                    lastSyncedAt: new Date(),
                                    rawPayload: { product: shopifyProduct, variant: shVariant },
                                }, { upsert: true, new: true });
                                const mapping = await models_1.ProductMapping.findOneAndUpdate({
                                    organizationId: req.tenantId,
                                    canonicalVariantId: platformVariant._id,
                                    channelConnectionId: conn._id,
                                }, {
                                    $set: {
                                        canonicalProductId: product._id,
                                        canonicalVariantId: platformVariant._id,
                                        channelConnectionId: conn._id,
                                        channelProductId: channelProd._id,
                                        channelType: shared_1.ChannelType.SHOPIFY,
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
                    }
                    catch (pubErr) {
                        const rawErrors = pubErr.response?.data?.errors;
                        let errorMsg = pubErr.message || 'Publishing failed';
                        if (rawErrors) {
                            if (typeof rawErrors === 'string') {
                                errorMsg = rawErrors;
                            }
                            else if (typeof rawErrors === 'object') {
                                errorMsg = JSON.stringify(rawErrors);
                            }
                        }
                        else if (pubErr.response?.data?.message) {
                            errorMsg = pubErr.response.data.message;
                        }
                        logger_1.logger.error(`Failed to publish product ${product.masterSku} to ${conn.name}: ${errorMsg}`);
                        results.push({
                            channelId: conn._id,
                            channelName: conn.name,
                            channelType: conn.channelType,
                            status: 'FAILED',
                            error: errorMsg,
                        });
                    }
                }
                else if (conn.channelType === shared_1.ChannelType.EBAY) {
                    try {
                        const { host, token } = await ebay_service_1.EbayService.getValidCredentials(conn);
                        const createdMappings = [];
                        for (let i = 0; i < variants.length; i++) {
                            const platformVariant = variants[i];
                            const inv = inventoryItems.find((invItem) => invItem.canonicalVariantId.toString() === platformVariant._id.toString());
                            const variantTitle = variants.length === 1
                                ? product.title
                                : `${product.title} - ${platformVariant.title}`;
                            const stock = inv?.trackedStock || 0;
                            const images = (product.images || [])
                                .map((img) => (typeof img === 'string' ? img : img.url))
                                .filter(Boolean);
                            const basePrice = typeof platformVariant.retailPrice === 'number' ? platformVariant.retailPrice : (product.defaultRetailPrice || 0);
                            const finalPrice = feePercent > 0
                                ? Math.round(basePrice * (1 + feePercent / 100) * 100) / 100
                                : basePrice;
                            const setResult = await ebay_service_1.EbayService.setInventoryItem(host, token, platformVariant.sku, {
                                title: variantTitle,
                                description: product.description || product.title,
                                quantity: stock,
                                price: finalPrice,
                                images,
                                brand: product.brand || 'Generic',
                                marketplaceId: conn.config?.marketplaceId || (conn.name.toLowerCase().includes('uk') ? 'EBAY_GB' : undefined),
                            });
                            if (!setResult.success) {
                                throw new Error(setResult.error || `Failed to publish SKU ${platformVariant.sku} to eBay`);
                            }
                            const listingId = setResult.listingId || platformVariant.sku;
                            const channelProd = await models_1.ChannelProduct.findOneAndUpdate({
                                organizationId: req.tenantId,
                                channelConnectionId: conn._id,
                                sku: platformVariant.sku,
                            }, {
                                channelType: shared_1.ChannelType.EBAY,
                                externalProductId: listingId,
                                externalVariantId: platformVariant.sku,
                                title: variantTitle,
                                sku: platformVariant.sku,
                                barcode: platformVariant.barcode || '',
                                price: finalPrice,
                                inventoryQuantity: stock,
                                status: shared_1.ChannelProductStatus.ACTIVE,
                                syncStatus: shared_1.SyncStatus.SYNCED,
                                lastSyncedAt: new Date(),
                                rawPayload: {
                                    sku: platformVariant.sku,
                                    title: variantTitle,
                                    price: finalPrice,
                                    quantity: stock,
                                    listingId,
                                    offerId: setResult.offerId,
                                },
                            }, { upsert: true, new: true });
                            const mapping = await models_1.ProductMapping.findOneAndUpdate({
                                organizationId: req.tenantId,
                                canonicalVariantId: platformVariant._id,
                                channelConnectionId: conn._id,
                            }, {
                                $set: {
                                    canonicalProductId: product._id,
                                    canonicalVariantId: platformVariant._id,
                                    channelConnectionId: conn._id,
                                    channelProductId: channelProd._id,
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
                            createdMappings.push(mapping);
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
                    }
                    catch (pubErr) {
                        const rawErrors = pubErr.response?.data?.errors;
                        let errorMsg = pubErr.message || 'Publishing failed';
                        if (rawErrors) {
                            if (typeof rawErrors === 'string') {
                                errorMsg = rawErrors;
                            }
                            else if (typeof rawErrors === 'object') {
                                errorMsg = JSON.stringify(rawErrors);
                            }
                        }
                        else if (pubErr.response?.data?.message) {
                            errorMsg = pubErr.response.data.message;
                        }
                        logger_1.logger.error(`Failed to publish product ${product.masterSku} to ${conn.name}: ${errorMsg}`);
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
                await notification_service_1.NotificationService.notifyProductUploaded({
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
        }
        catch (error) {
            logger_1.logger.error('Failed to publish product:', error?.message || String(error));
            return res.status(500).json({
                success: false,
                error: { message: error?.message || 'Failed to publish product' },
            });
        }
    }
    // POST /api/v1/products/bulk-publish - Bulk map/push multiple products to selected channels
    static async bulkPublish(req, res) {
        try {
            const { items, productIds, channelConnectionIds, forceRepublish = true } = req.body;
            let tasks = [];
            if (Array.isArray(items) && items.length > 0) {
                tasks = items.map((item) => ({
                    productId: String(item.productId),
                    targetChannelIds: Array.isArray(item.channelConnectionIds) && item.channelConnectionIds.length > 0
                        ? item.channelConnectionIds
                        : Array.isArray(channelConnectionIds)
                            ? channelConnectionIds
                            : undefined,
                }));
            }
            else if (Array.isArray(productIds) && productIds.length > 0) {
                const defaultTargets = Array.isArray(channelConnectionIds) && channelConnectionIds.length > 0
                    ? channelConnectionIds
                    : undefined;
                tasks = productIds.map((pId) => ({
                    productId: String(pId),
                    targetChannelIds: defaultTargets,
                }));
            }
            else {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Must provide either "items" or "productIds"' },
                });
            }
            const overallResults = [];
            let successfulCount = 0;
            let failedCount = 0;
            for (const task of tasks) {
                try {
                    const fakeReq = {
                        params: { id: task.productId },
                        body: {
                            channelConnectionIds: task.targetChannelIds,
                            forceRepublish,
                        },
                        tenantId: req.tenantId,
                    };
                    let capturedData = null;
                    let capturedError = null;
                    let capturedStatus = 200;
                    const fakeRes = {
                        status: (st) => {
                            capturedStatus = st;
                            return fakeRes;
                        },
                        json: (payload) => {
                            if (payload.success) {
                                capturedData = payload.data;
                            }
                            else {
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
                    }
                    else {
                        failedCount++;
                        overallResults.push({
                            productId: task.productId,
                            success: false,
                            error: capturedError?.message || 'Publishing failed',
                        });
                    }
                }
                catch (err) {
                    failedCount++;
                    overallResults.push({
                        productId: task.productId,
                        success: false,
                        error: err.message || 'Publishing failed',
                    });
                }
            }
            if (successfulCount > 0) {
                await notification_service_1.NotificationService.notifyProductUploaded({
                    organizationId: req.tenantId,
                    productTitle: `${successfulCount} Products`,
                    channelName: 'Connected Channels',
                    channelType: shared_1.ChannelType.CUSTOM_STORE,
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
                    message: `Successfully mapped and pushed ${successfulCount} products!${failedCount > 0 ? ` (${failedCount} had errors or missing channels)` : ''}`,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to bulk publish products:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to bulk publish products' },
            });
        }
    }
}
exports.ProductsController = ProductsController;
//# sourceMappingURL=products.controller.js.map