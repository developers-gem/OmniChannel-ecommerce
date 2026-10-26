import { Request, Response } from 'express';
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

export class DashboardController {
  // GET /api/v1/dashboard/metrics - Aggregates genuine real-time metrics across the tenant's catalog, sales, and inventory
  static async getMetrics(req: Request, res: Response) {
    try {
      const tenantId = req.tenantId;

      const [
        totalProducts,
        totalVariants,
        allChannelProducts,
        activeMappings,
        activeChannels,
        inventoryItems,
      ] = await Promise.all([
        CanonicalProduct.countDocuments({ organizationId: tenantId }),
        ProductVariant.countDocuments({ organizationId: tenantId }),
        ChannelProduct.find({ organizationId: tenantId }).lean(),
        ProductMapping.find({ organizationId: tenantId, status: 'MAPPED' }).lean(),
        ChannelConnection.find({ organizationId: tenantId, status: ChannelStatus.ACTIVE }).lean(),
        InventoryItem.find({ organizationId: tenantId }).lean(),
      ]);

      const totalListings = allChannelProducts.length;
      const totalMapped = activeMappings.length;

      // Calculate distinct canonical products mapped per channel
      const mappedCanonicalIds = new Set<string>();
      const shopifyProdSet = new Set<string>();
      const ebayProdSet = new Set<string>();

      const shopifyConn = activeChannels.find((c) => c.channelType === 'SHOPIFY');
      const ebayConn = activeChannels.find((c) => c.channelType === 'EBAY');

      const shopifyConnId = shopifyConn?._id?.toString();
      const ebayConnId = ebayConn?._id?.toString();

      for (const m of activeMappings) {
        const pId = m.canonicalProductId?.toString();
        const chId = m.channelConnectionId?.toString();
        if (pId) {
          mappedCanonicalIds.add(pId);
          if (chId === shopifyConnId) shopifyProdSet.add(pId);
          if (chId === ebayConnId) ebayProdSet.add(pId);
        }
      }

      const zeroMappedCount = Math.max(0, totalProducts - mappedCanonicalIds.size);

      let incompleteMappedCount = 0;
      if (activeChannels.length > 1) {
        const canonicalIds = await CanonicalProduct.find({ organizationId: tenantId }).distinct('_id');
        for (const cid of canonicalIds) {
          const cidStr = cid.toString();
          const mappedToChannels = activeMappings
            .filter((m) => m.canonicalProductId?.toString() === cidStr)
            .map((m) => m.channelConnectionId?.toString());
          const uniqueCh = new Set(mappedToChannels);
          if (uniqueCh.size > 0 && uniqueCh.size < activeChannels.length) {
            incompleteMappedCount++;
          }
        }
      }

      const shopifyListings = shopifyConnId
        ? allChannelProducts.filter((p) => p.channelConnectionId?.toString() === shopifyConnId).length
        : 0;
      const ebayListings = ebayConnId
        ? allChannelProducts.filter((p) => p.channelConnectionId?.toString() === ebayConnId).length
        : 0;

      const lowStockCount = inventoryItems.filter(
        (i) => i.availableToAllocate <= i.lowStockThreshold
      ).length;

      const totalStockOnHand = inventoryItems.reduce((sum, i) => sum + i.trackedStock, 0);

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
