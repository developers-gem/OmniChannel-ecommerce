"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersController = void 0;
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const database_1 = require("../../database");
const logger_1 = require("../../utils/logger");
class OrdersController {
    // GET /api/v1/orders - List centralized orders with filter by channel, status, search, and date
    static async list(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const channelType = req.query.channelType;
            const financialStatus = req.query.financialStatus;
            const fulfillmentStatus = req.query.fulfillmentStatus;
            const search = req.query.search || '';
            const query = { organizationId: req.tenantId };
            if (channelType)
                query.channelType = channelType;
            if (financialStatus)
                query.financialStatus = financialStatus;
            if (fulfillmentStatus)
                query.fulfillmentStatus = fulfillmentStatus;
            if (search) {
                query.$or = [
                    { orderNumber: { $regex: search, $options: 'i' } },
                    { externalOrderId: { $regex: search, $options: 'i' } },
                    { 'customer.name': { $regex: search, $options: 'i' } },
                    { 'customer.email': { $regex: search, $options: 'i' } },
                ];
            }
            const total = await models_1.Order.countDocuments(query);
            const orders = await models_1.Order.find(query)
                .populate('channelConnectionId', 'name channelType')
                .sort({ placedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            // Fetch order lines for these orders
            const orderIds = orders.map((o) => o._id);
            const lines = await models_1.OrderLine.find({ orderId: { $in: orderIds } }).lean();
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
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list orders' },
            });
        }
    }
    // GET /api/v1/orders/:id - Get single order details with lines, fulfillments, and transactions
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const order = await models_1.Order.findOne({
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
            const lines = await models_1.OrderLine.find({ orderId: order._id }).lean();
            const fulfillments = await models_1.Fulfillment.find({ orderId: order._id }).lean();
            const transactions = await models_1.FinancialTransaction.find({ orderId: order._id }).lean();
            return res.json({
                success: true,
                data: {
                    ...order,
                    lines,
                    fulfillments,
                    transactions,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch order details' },
            });
        }
    }
    // POST /api/v1/orders/:id/fulfill - Fulfill an order with tracking information
    static async fulfill(req, res) {
        try {
            const { id } = req.params;
            const { trackingCompany, trackingNumber, trackingUrl } = req.body;
            const order = await models_1.Order.findOne({
                _id: id,
                organizationId: req.tenantId,
            });
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Order not found', code: 'NOT_FOUND' },
                });
            }
            const lines = await models_1.OrderLine.find({ orderId: order._id });
            const fulfillment = await models_1.Fulfillment.create({
                organizationId: req.tenantId,
                orderId: order._id,
                trackingCompany,
                trackingNumber,
                trackingUrl,
                status: 'DELIVERED',
                lineItemIds: lines.map((l) => l._id),
            });
            // Deduct tracked stock and release reserved stock upon fulfillment
            for (const line of lines) {
                if (line.canonicalVariantId) {
                    const invItem = await models_1.InventoryItem.findOne({
                        organizationId: req.tenantId,
                        canonicalVariantId: line.canonicalVariantId,
                    });
                    if (invItem) {
                        const prevTracked = invItem.trackedStock;
                        invItem.trackedStock = Math.max(0, invItem.trackedStock - line.quantity);
                        invItem.reservedStock = Math.max(0, invItem.reservedStock - line.quantity);
                        invItem.availableToAllocate = Math.max(0, invItem.trackedStock - invItem.reservedStock - invItem.safetyStock);
                        await invItem.save();
                        await models_1.InventoryMovement.create({
                            organizationId: req.tenantId,
                            canonicalVariantId: line.canonicalVariantId,
                            changeType: shared_1.InventoryChangeType.ORDER_FULFILLED,
                            quantityChanged: -line.quantity,
                            previousTrackedStock: prevTracked,
                            newTrackedStock: invItem.trackedStock,
                            reason: `Order ${order.orderNumber} fulfilled with tracking ${trackingNumber}`,
                            referenceId: order.orderNumber,
                            performedBy: req.user?.userId,
                        });
                    }
                }
            }
            order.fulfillmentStatus = shared_1.OrderFulfillmentStatus.FULFILLED;
            await order.save();
            logger_1.logger.info(`Order ${order.orderNumber} marked as fulfilled with tracking ${trackingNumber}`);
            return res.json({
                success: true,
                data: {
                    order,
                    fulfillment,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fulfill order' },
            });
        }
    }
    // POST /api/v1/orders/:id/cancel - Cancel an order and release reserved stock
    static async cancel(req, res) {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const updatedOrder = await (0, database_1.runInTransaction)(async (session) => {
                const order = await models_1.Order.findOne({
                    _id: id,
                    organizationId: req.tenantId,
                });
                if (!order) {
                    throw new Error('Order not found');
                }
                if (order.fulfillmentStatus === shared_1.OrderFulfillmentStatus.CANCELLED) {
                    throw new Error('Order is already cancelled');
                }
                const lines = await models_1.OrderLine.find({ orderId: order._id });
                const wasFulfilled = order.fulfillmentStatus === shared_1.OrderFulfillmentStatus.FULFILLED;
                // Release reserved stock back into available pool if not yet fulfilled, OR restock trackedStock if already fulfilled
                for (const line of lines) {
                    if (line.canonicalVariantId) {
                        const invItem = await models_1.InventoryItem.findOne({
                            organizationId: req.tenantId,
                            canonicalVariantId: line.canonicalVariantId,
                        });
                        if (invItem) {
                            const prevTracked = invItem.trackedStock;
                            if (wasFulfilled) {
                                invItem.trackedStock += line.quantity;
                            }
                            else {
                                invItem.reservedStock = Math.max(0, invItem.reservedStock - line.quantity);
                            }
                            invItem.availableToAllocate = Math.max(0, invItem.trackedStock - invItem.reservedStock - invItem.safetyStock);
                            await invItem.save();
                            await models_1.InventoryMovement.create({
                                organizationId: req.tenantId,
                                canonicalVariantId: line.canonicalVariantId,
                                changeType: wasFulfilled ? shared_1.InventoryChangeType.RETURN_RESTOCK : shared_1.InventoryChangeType.ORDER_CANCELLED,
                                quantityChanged: line.quantity,
                                previousTrackedStock: prevTracked,
                                newTrackedStock: invItem.trackedStock,
                                reason: `Order ${order.orderNumber} cancelled (${reason || 'Merchant initiated'})`,
                                referenceId: order.orderNumber,
                                performedBy: req.user?.userId,
                            });
                        }
                    }
                }
                order.fulfillmentStatus = shared_1.OrderFulfillmentStatus.CANCELLED;
                order.financialStatus = shared_1.OrderFinancialStatus.VOIDED;
                await order.save();
                logger_1.logger.info(`Order ${order.orderNumber} cancelled successfully`);
                return order;
            });
            return res.json({
                success: true,
                data: updatedOrder,
            });
        }
        catch (error) {
            const status = error.message === 'Order not found' ? 404 : error.message === 'Order is already cancelled' ? 400 : 500;
            return res.status(status).json({
                success: false,
                error: { message: error.message || 'Failed to cancel order' },
            });
        }
    }
}
exports.OrdersController = OrdersController;
//# sourceMappingURL=orders.controller.js.map