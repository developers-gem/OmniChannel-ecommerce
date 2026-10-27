import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  CanonicalProduct,
  ProductVariant,
  ChannelProduct,
  ProductMapping,
  ChannelConnection,
  Order,
  InventoryItem,
  SyncJob,
} from '../../database/models';
import { ChannelStatus } from '@multichannel/shared';
import { logger } from '../../utils/logger';

export class DashboardController {
  // GET /api/v1/dashboard/metrics - Aggregates genuine real-time metrics across the tenant's catalog, sales, and inventory
  static async getMetrics(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId;
      const tenantOrgId = tenantId && mongoose.Types.ObjectId.isValid(tenantId)
        ? new mongoose.Types.ObjectId(tenantId)
        : tenantId;

      const [
        totalProducts,
        totalVariants,
        channelListingsAgg,
        activeMappings,
        activeChannels,
        inventoryAgg,
      ] = await Promise.all([
        CanonicalProduct.countDocuments({ organizationId: tenantId }),
        ProductVariant.countDocuments({ organizationId: tenantId }),
        ChannelProduct.aggregate([
          { $match: { organizationId: tenantOrgId || tenantId } },
          { $group: { _id: '$channelConnectionId', totalListings: { $sum: 1 } } },
        ]),
        ProductMapping.find(
          { organizationId: tenantId, status: 'MAPPED' },
          { canonicalProductId: 1, channelConnectionId: 1 }
        ).lean(),
        ChannelConnection.find({ organizationId: tenantId, status: ChannelStatus.ACTIVE }).lean(),
        InventoryItem.aggregate([
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
      const mappedCanonicalIds = new Set<string>();
      const shopifyProdSet = new Set<string>();
      const ebayProdSet = new Set<string>();

      const shopifyConnIds = new Set(
        activeChannels
          .filter((c) => c.channelType === 'SHOPIFY')
          .map((c) => c._id?.toString())
          .filter(Boolean)
      );
      const ebayConnIds = new Set(
        activeChannels
          .filter((c) => c.channelType === 'EBAY')
          .map((c) => c._id?.toString())
          .filter(Boolean)
      );

      // Map to track which channels each canonical product is mapped to
      const prodToChannelMap = new Map<string, Set<string>>();

      for (const m of activeMappings) {
        const pId = m.canonicalProductId?.toString();
        const chId = m.channelConnectionId?.toString();
        if (pId) {
          mappedCanonicalIds.add(pId);
          if (chId && shopifyConnIds.has(chId)) shopifyProdSet.add(pId);
          if (chId && ebayConnIds.has(chId)) ebayProdSet.add(pId);

          if (chId) {
            if (!prodToChannelMap.has(pId)) {
              prodToChannelMap.set(pId, new Set<string>());
            }
            prodToChannelMap.get(pId)!.add(chId);
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
        Order.find({ organizationId: tenantId, placedAt: { $gte: oneDayAgo } }).lean(),
        Order.find({ organizationId: tenantId, placedAt: { $gte: thirtyDaysAgo } }).lean(),
        Order.find({ organizationId: tenantId })
          .populate('channelConnectionId', 'name channelType')
          .sort({ placedAt: -1 })
          .limit(5)
          .lean(),
        SyncJob.find({ organizationId: tenantId })
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
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch dashboard metrics' },
      });
    }
  }
}
