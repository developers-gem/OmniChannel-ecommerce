import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  InventoryItem,
  InventoryAllocation,
  InventoryMovement,
  ProductVariant,
  CanonicalProduct,
  ChannelConnection,
} from '../../database/models';
import { InventoryChangeType, AllocationType } from '@multichannel/shared';
import { runInTransaction } from '../../database';
import { logger } from '../../utils/logger';

export class InventoryController {
  // GET /api/v1/inventory - List stock items with available-to-allocate and low stock flags
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const lowStockOnly = req.query.lowStock === 'true';

      const query: any = { organizationId: req.tenantId };
      if (lowStockOnly) {
        query.$expr = { $lte: ['$availableToAllocate', '$lowStockThreshold'] };
      }

      const total = await InventoryItem.countDocuments(query);
      const items = await InventoryItem.find(query)
        .populate({
          path: 'canonicalVariantId',
          select: 'title sku costPrice retailPrice canonicalProductId',
          populate: { path: 'canonicalProductId', select: 'title brand masterSku' },
        })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // Fetch allocations for these items
      const variantIds = items.map((i) => i.canonicalVariantId?._id);
      const allocations = await InventoryAllocation.find({
        organizationId: req.tenantId,
        canonicalVariantId: { $in: variantIds },
      })
        .populate('channelConnectionId', 'name channelType')
        .lean();

      const enrichedItems = items.map((item) => {
        const itemAllocations = allocations.filter(
          (a) => a.canonicalVariantId?.toString() === item.canonicalVariantId?._id?.toString()
        );
        return {
          ...item,
          allocations: itemAllocations,
          isLowStock: item.availableToAllocate <= item.lowStockThreshold,
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
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list inventory items' },
      });
    }
  }

  // POST /api/v1/inventory/:variantId/adjust - Atomically adjust inventory with audit movement logging
  static async adjust(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      const { trackedStock, safetyStock, reason } = req.body;

      const updatedItem = await runInTransaction(async (session) => {
        const item = await InventoryItem.findOne({
          organizationId: req.tenantId,
          canonicalVariantId: variantId,
        });

        if (!item) {
          throw new Error('Inventory item not found');
        }

        const previousStock = item.trackedStock;
        const newStock = trackedStock !== undefined ? trackedStock : previousStock;
        const quantityChanged = newStock - previousStock;

        item.trackedStock = newStock;
        if (safetyStock !== undefined) {
          item.safetyStock = safetyStock;
        }
        item.availableToAllocate = Math.max(0, item.trackedStock - item.reservedStock - item.safetyStock);
        item.version += 1;
        await item.save();

        // Create immutable movement entry
        await InventoryMovement.create({
          organizationId: req.tenantId,
          canonicalVariantId: item.canonicalVariantId,
          changeType: InventoryChangeType.MANUAL_ADJUSTMENT,
          quantityChanged,
          previousTrackedStock: previousStock,
          newTrackedStock: newStock,
          reason: reason || 'Manual stock adjustment',
          performedBy: req.user?.userId,
        });

        logger.info(`Stock adjusted for SKU ${item.sku}: ${previousStock} -> ${newStock} (${reason})`);
        return item;
      });

      return res.json({
        success: true,
        data: updatedItem,
      });
    } catch (error: any) {
      return res.status(error.message === 'Inventory item not found' ? 404 : 500).json({
        success: false,
        error: { message: error.message || 'Failed to adjust inventory' },
      });
    }
  }

  // GET /api/v1/inventory/movements - Get historical inventory movement ledger
  static async getMovements(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const variantId = req.query.variantId as string;

      const query: any = { organizationId: req.tenantId };
      if (variantId) {
        query.canonicalVariantId = variantId;
      }

      const total = await InventoryMovement.countDocuments(query);
      const movements = await InventoryMovement.find(query)
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
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list inventory movements' },
      });
    }
  }

  // PUT /api/v1/inventory/:variantId/allocations - Set channel allocation policy (Shared Pool, Fixed, Percentage)
  static async setAllocation(req: Request, res: Response) {
    try {
      const { variantId } = req.params;
      const { channelConnectionId, allocationType, allocationValue } = req.body;

      const allocation = await InventoryAllocation.findOneAndUpdate(
        {
          organizationId: req.tenantId,
          canonicalVariantId: variantId,
          channelConnectionId,
        },
        {
          $set: {
            allocationType: allocationType || AllocationType.SHARED_POOL,
            allocationValue: allocationValue ?? 100,
          },
        },
        { upsert: true, new: true }
      );

      return res.json({
        success: true,
        data: allocation,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update channel allocation' },
      });
    }
  }
}
