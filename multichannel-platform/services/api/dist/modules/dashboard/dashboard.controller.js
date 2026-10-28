"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
class DashboardController {
    // GET /api/v1/dashboard/metrics - Aggregates genuine real-time metrics across the tenant's catalog, sales, and inventory
    static async getMetrics(req, res) {
        try {
            const tenantId = req.tenantId;
            const tenantOrgId = tenantId && mongoose_1.default.Types.ObjectId.isValid(tenantId)
                ? new mongoose_1.default.Types.ObjectId(tenantId)
                : tenantId;
            const [totalProducts, totalVariants, channelListingsAgg, activeMappings, activeChannels, inventoryAgg,] = await Promise.all([
                models_1.CanonicalProduct.countDocuments({ organizationId: tenantId }),
                models_1.ProductVariant.countDocuments({ organizationId: tenantId }),
                models_1.ChannelProduct.aggregate([
                    { $match: { organizationId: tenantOrgId || tenantId } },
                    { $group: { _id: '$channelConnectionId', totalListings: { $sum: 1 } } },
                ]),
                models_1.ProductMapping.find({ organizationId: tenantId, status: 'MAPPED' }, { canonicalProductId: 1, channelConnectionId: 1 }).lean(),
                models_1.ChannelConnection.find({ organizationId: tenantId, status: shared_1.ChannelStatus.ACTIVE }).lean(),
                models_1.InventoryItem.aggregate([
                    { $match: { organizationId: tenantOrgId || tenantId } },
                    {
                        $group: {
                            _id: null,
                            totalStock: { $sum: '$trackedStock' },
                            lowStockCount: {
                                $sum: {
                                    $cond: [{ $lte: ['$availableToAllocate', '$lowStockThreshold'] }, 1, 0],
                                },
                            },
                        },
                    },
                ]),
            ]);
            const totalListings = channelListingsAgg.reduce((sum, c) => sum + (c.totalListings || 0), 0);
            const totalMapped = activeMappings.length;
            // Calculate distinct canonical products mapped per channel
            const mappedCanonicalIds = new Set();
            const shopifyProdSet = new Set();
            const ebayProdSet = new Set();
            const shopifyConnIds = new Set(activeChannels
                .filter((c) => c.channelType === 'SHOPIFY')
                .map((c) => c._id?.toString())
                .filter(Boolean));
            const ebayConnIds = new Set(activeChannels
                .filter((c) => c.channelType === 'EBAY')
                .map((c) => c._id?.toString())
                .filter(Boolean));
            // Map to track which channels each canonical product is mapped to
            const prodToChannelMap = new Map();
            for (const m of activeMappings) {
                const pId = m.canonicalProductId?.toString();
                const chId = m.channelConnectionId?.toString();
                if (pId) {
                    mappedCanonicalIds.add(pId);
                    if (chId && shopifyConnIds.has(chId))
                        shopifyProdSet.add(pId);
                    if (chId && ebayConnIds.has(chId))
                        ebayProdSet.add(pId);
                    if (chId) {
                        if (!prodToChannelMap.has(pId)) {
                            prodToChannelMap.set(pId, new Set());
                        }
                        prodToChannelMap.get(pId).add(chId);
                    }
                }
            }
            const zeroMappedCount = Math.max(0, totalProducts - mappedCanonicalIds.size);
            let incompleteMappedCount = 0;
            if (activeChannels.length > 1) {
                for (const chSet of prodToChannelMap.values()) {
                    if (chSet.size > 0 && chSet.size < activeChannels.length) {
                        incompleteMappedCount++;
                    }
                }
            }
            const shopifyListings = channelListingsAgg
                .filter((c) => shopifyConnIds.has(c._id?.toString() || ''))
                .reduce((sum, c) => sum + (c.totalListings || 0), 0);
            const ebayListings = channelListingsAgg
                .filter((c) => ebayConnIds.has(c._id?.toString() || ''))
                .reduce((sum, c) => sum + (c.totalListings || 0), 0);
            const totalStockOnHand = inventoryAgg[0]?.totalStock || 0;
            const lowStockCount = inventoryAgg[0]?.lowStockCount || 0;
            // 30-day and 24-hour order metrics
            const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
            const [recentOrders24h, recentOrders30d, recentOrdersList, recentSyncJobs] = await Promise.all([
                models_1.Order.find({ organizationId: tenantId, placedAt: { $gte: oneDayAgo } }).lean(),
                models_1.Order.find({ organizationId: tenantId, placedAt: { $gte: thirtyDaysAgo } }).lean(),
                models_1.Order.find({ organizationId: tenantId })
                    .populate('channelConnectionId', 'name channelType')
                    .sort({ placedAt: -1 })
                    .limit(5)
                    .lean(),
                models_1.SyncJob.find({ organizationId: tenantId })
                    .populate('channelConnectionId', 'name channelType')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
            ]);
            const revenue24h = recentOrders24h.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
            const revenue30d = recentOrders30d.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
            return res.json({
                success: true,
                data: {
                    catalog: {
                        totalProducts,
                        totalVariants,
                        totalListings,
                        totalMapped,
                        mappingPercentage: totalListings > 0 ? Math.round((totalMapped / totalListings) * 100) : 0,
                        shopifyProducts: shopifyProdSet.size,
                        shopifyListings,
                        ebayProducts: ebayProdSet.size,
                        ebayListings,
                        zeroMappedCount,
                        incompleteMappedCount,
                    },
                    inventory: {
                        totalStockOnHand,
                        lowStockCount,
                    },
                    sales: {
                        orders24h: recentOrders24h.length,
                        revenue24h: Math.round(revenue24h * 100) / 100,
                        orders30d: recentOrders30d.length,
                        revenue30d: Math.round(revenue30d * 100) / 100,
                    },
                    channels: {
                        activeCount: activeChannels.length,
                    },
                    recentOrders: recentOrdersList,
                    recentSyncJobs,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch dashboard metrics' },
            });
        }
    }
}
exports.DashboardController = DashboardController;
//# sourceMappingURL=dashboard.controller.js.map