import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  Order,
  OrderLine,
  Fulfillment,
  FinancialTransaction,
  InventoryItem,
  InventoryMovement,
  ProductVariant,
} from '../../database/models';
import {
  OrderFinancialStatus,
  OrderFulfillmentStatus,
  TransactionType,
  InventoryChangeType,
} from '@multichannel/shared';
import { runInTransaction } from '../../database';
import { logger } from '../../utils/logger';

export class OrdersController {
  // GET /api/v1/orders - List centralized orders with filter by channel, status, search, and date
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const channelType = req.query.channelType as string;
      const financialStatus = req.query.financialStatus as string;
      const fulfillmentStatus = req.query.fulfillmentStatus as string;
      const search = (req.query.search as string) || '';

      const query: any = { organizationId: req.tenantId };
      if (channelType) query.channelType = channelType;
      if (financialStatus) query.financialStatus = financialStatus;
      if (fulfillmentStatus) query.fulfillmentStatus = fulfillmentStatus;

      if (search) {
        query.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { externalOrderId: { $regex: search, $options: 'i' } },
          { 'customer.name': { $regex: search, $options: 'i' } },
          { 'customer.email': { $regex: search, $options: 'i' } },
        ];
      }

      const total = await Order.countDocuments(query);
      const orders = await Order.find(query)
        .populate('channelConnectionId', 'name channelType')
        .sort({ placedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // Fetch order lines for these orders
      const orderIds = orders.map((o) => o._id);
      const lines = await OrderLine.find({ orderId: { $in: orderIds } }).lean();

      const enrichedOrders = orders.map((order) => {
        const orderLines = lines.filter((l) => l.orderId.toString() === order._id.toString());
        return {
          ...order,
          lines: orderLines,
          itemCount: orderLines.reduce((sum, l) => sum + l.quantity, 0),
        };
      });

      return res.json({
        success: true,
        data: enrichedOrders,
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
        error: { message: error.message || 'Failed to list orders' },
      });
    }
  }

  // GET /api/v1/orders/:id - Get single order details with lines, fulfillments, and transactions
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const order = await Order.findOne({
        _id: id,
        organizationId: req.tenantId,
      })
        .populate('channelConnectionId', 'name channelType')
        .lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          error: { message: 'Order not found', code: 'NOT_FOUND' },
        });
      }

      const lines = await OrderLine.find({ orderId: order._id }).lean();
      const fulfillments = await Fulfillment.find({ orderId: order._id }).lean();
      const transactions = await FinancialTransaction.find({ orderId: order._id }).lean();

      return res.json({
        success: true,
        data: {
          ...order,
          lines,
          fulfillments,
          transactions,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch order details' },
      });
    }
  }

  // POST /api/v1/orders/:id/fulfill - Fulfill an order with tracking information
  static async fulfill(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { trackingCompany, trackingNumber, trackingUrl } = req.body;

      const order = await Order.findOne({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: { message: 'Order not found', code: 'NOT_FOUND' },
        });
      }

      const lines = await OrderLine.find({ orderId: order._id });

      const fulfillment = await Fulfillment.create({
        organizationId: req.tenantId,
        orderId: order._id,
        trackingCompany,
        trackingNumber,
        trackingUrl,
        status: 'DELIVERED',
        lineItemIds: lines.map((l) => l._id),
      });

      order.fulfillmentStatus = OrderFulfillmentStatus.FULFILLED;
      await order.save();

      logger.info(`Order ${order.orderNumber} marked as fulfilled with tracking ${trackingNumber}`);

      return res.json({
        success: true,
        data: {
          order,
          fulfillment,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fulfill order' },
      });
    }
  }

  // POST /api/v1/orders/:id/cancel - Cancel an order and release reserved stock
  static async cancel(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const updatedOrder = await runInTransaction(async (session) => {
        const order = await Order.findOne({
          _id: id,
          organizationId: req.tenantId,
        });

        if (!order) {
          throw new Error('Order not found');
        }

        if (order.fulfillmentStatus === OrderFulfillmentStatus.CANCELLED) {
          throw new Error('Order is already cancelled');
        }

        const lines = await OrderLine.find({ orderId: order._id });

        // Release reserved stock back into available pool if not yet fulfilled
        for (const line of lines) {
          if (line.canonicalVariantId) {
            const invItem = await InventoryItem.findOne({
              organizationId: req.tenantId,
              canonicalVariantId: line.canonicalVariantId,
            });

            if (invItem) {
              invItem.reservedStock = Math.max(0, invItem.reservedStock - line.quantity);
              invItem.availableToAllocate = Math.max(
                0,
                invItem.trackedStock - invItem.reservedStock - invItem.safetyStock
              );
              await invItem.save();

              await InventoryMovement.create({
                organizationId: req.tenantId,
                canonicalVariantId: line.canonicalVariantId,
                changeType: InventoryChangeType.ORDER_CANCELLED,
                quantityChanged: line.quantity,
                previousTrackedStock: invItem.trackedStock,
                newTrackedStock: invItem.trackedStock,
                reason: `Order ${order.orderNumber} cancelled (${reason || 'Merchant initiated'})`,
                referenceId: order.orderNumber,
                performedBy: req.user?.userId,
              });
            }
          }
        }

        order.fulfillmentStatus = OrderFulfillmentStatus.CANCELLED;
        order.financialStatus = OrderFinancialStatus.VOIDED;
        await order.save();

        logger.info(`Order ${order.orderNumber} cancelled successfully`);
        return order;
      });

      return res.json({
        success: true,
        data: updatedOrder,
      });
    } catch (error: any) {
      const status = error.message === 'Order not found' ? 404 : error.message === 'Order is already cancelled' ? 400 : 500;
      return res.status(status).json({
        success: false,
        error: { message: error.message || 'Failed to cancel order' },
      });
    }
  }
}
