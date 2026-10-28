"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PnLController = void 0;
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const logger_1 = require("../../utils/logger");
class PnLController {
    // GET /api/v1/pnl/summary - Overall financial metrics with breakdown
    static async getSummary(req, res) {
        try {
            const channelId = req.query.channelId;
            const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
            const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
            const orderQuery = {
                organizationId: req.tenantId,
                placedAt: { $gte: startDate, $lte: endDate },
            };
            if (channelId) {
                orderQuery.channelConnectionId = channelId;
            }
            const orders = await models_1.Order.find(orderQuery).lean();
            const orderIds = orders.map((o) => o._id);
            const lines = await models_1.OrderLine.find({ orderId: { $in: orderIds } }).lean();
            // Aggregate revenue & discounts
            const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
            const totalDiscounts = orders.reduce((sum, o) => sum + (o.totalDiscount || 0), 0);
            const totalShippingRevenue = orders.reduce((sum, o) => sum + (o.totalShipping || 0), 0);
            // COGS from frozen historical unit costs on order lines
            const totalCOGS = lines.reduce((sum, l) => sum + (l.unitCost || 0) * (l.quantity || 1), 0);
            // Aggregate financial transactions (fees, shipping costs, refunds)
            const txQuery = {
                organizationId: req.tenantId,
                date: { $gte: startDate, $lte: endDate },
            };
            if (channelId)
                txQuery.channelConnectionId = channelId;
            const transactions = await models_1.FinancialTransaction.find(txQuery).lean();
            const totalMarketplaceFees = transactions
                .filter((t) => t.type === shared_1.TransactionType.MARKETPLACE_FEE)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0) || orders.reduce((sum, o) => sum + (o.channelFee || 0), 0);
            const totalPaymentFees = transactions
                .filter((t) => t.type === shared_1.TransactionType.PAYMENT_PROCESSING_FEE)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const totalShippingExpenses = transactions
                .filter((t) => t.type === shared_1.TransactionType.SHIPPING_COST)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const totalRefunds = transactions
                .filter((t) => t.type === shared_1.TransactionType.REFUND)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const netRevenue = totalRevenue - totalRefunds;
            const grossProfit = netRevenue - totalCOGS;
            const netContribution = grossProfit - totalMarketplaceFees - totalPaymentFees - totalShippingExpenses;
            const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
            const netMargin = netRevenue > 0 ? (netContribution / netRevenue) * 100 : 0;
            return res.json({
                success: true,
                data: {
                    metrics: {
                        totalRevenue: Math.round(totalRevenue * 100) / 100,
                        totalDiscounts: Math.round(totalDiscounts * 100) / 100,
                        totalRefunds: Math.round(totalRefunds * 100) / 100,
                        netRevenue: Math.round(netRevenue * 100) / 100,
                        totalCOGS: Math.round(totalCOGS * 100) / 100,
                        totalMarketplaceFees: Math.round(totalMarketplaceFees * 100) / 100,
                        totalPaymentFees: Math.round(totalPaymentFees * 100) / 100,
                        totalShippingExpenses: Math.round(totalShippingExpenses * 100) / 100,
                        grossProfit: Math.round(grossProfit * 100) / 100,
                        netContribution: Math.round(netContribution * 100) / 100,
                        grossMarginPercentage: Math.round(grossMargin * 10) / 10,
                        netMarginPercentage: Math.round(netMargin * 10) / 10,
                        orderCount: orders.length,
                    },
                    dateRange: { startDate, endDate },
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to compute PnL summary:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to compute PnL summary' },
            });
        }
    }
    // GET /api/v1/pnl/products - Product-level profitability breakdown and loss-making identification
    static async getProductProfitability(req, res) {
        try {
            const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
            const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
            const orders = await models_1.Order.find({
                organizationId: req.tenantId,
                placedAt: { $gte: startDate, $lte: endDate },
            }).lean();
            const orderIds = orders.map((o) => o._id);
            const lines = await models_1.OrderLine.find({ orderId: { $in: orderIds } }).lean();
            // Aggregate by SKU
            const skuStats = {};
            for (const line of lines) {
                if (!skuStats[line.sku]) {
                    skuStats[line.sku] = {
                        sku: line.sku,
                        title: line.title,
                        unitsSold: 0,
                        revenue: 0,
                        cogs: 0,
                    };
                }
                skuStats[line.sku].unitsSold += line.quantity;
                skuStats[line.sku].revenue += line.unitPrice * line.quantity;
                skuStats[line.sku].cogs += line.unitCost * line.quantity;
            }
            const productPerformance = Object.values(skuStats).map((item) => {
                const grossProfit = item.revenue - item.cogs;
                const grossMargin = item.revenue > 0 ? (grossProfit / item.revenue) * 100 : 0;
                return {
                    sku: item.sku,
                    title: item.title,
                    unitsSold: item.unitsSold,
                    revenue: Math.round(item.revenue * 100) / 100,
                    cogs: Math.round(item.cogs * 100) / 100,
                    grossProfit: Math.round(grossProfit * 100) / 100,
                    grossMargin: Math.round(grossMargin * 10) / 10,
                    isLossMaking: grossProfit < 0,
                };
            });
            productPerformance.sort((a, b) => b.revenue - a.revenue);
            return res.json({
                success: true,
                data: productPerformance,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch product profitability' },
            });
        }
    }
    // GET /api/v1/pnl/channels - Channel-level revenue and contribution margin breakdown
    static async getChannelProfitability(req, res) {
        try {
            const channels = await models_1.ChannelConnection.find({ organizationId: req.tenantId }).lean();
            const channelBreakdown = [];
            for (const ch of channels) {
                const orders = await models_1.Order.find({
                    organizationId: req.tenantId,
                    channelConnectionId: ch._id,
                }).lean();
                const orderIds = orders.map((o) => o._id);
                const lines = await models_1.OrderLine.find({ orderId: { $in: orderIds } }).lean();
                const revenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
                const cogs = lines.reduce((sum, l) => sum + (l.unitCost || 0) * (l.quantity || 1), 0);
                const fees = orders.reduce((sum, o) => sum + (o.channelFee || 0), 0);
                const grossProfit = revenue - cogs;
                const netContribution = grossProfit - fees;
                channelBreakdown.push({
                    channelId: ch._id,
                    channelName: ch.name,
                    channelType: ch.channelType,
                    orderCount: orders.length,
                    revenue: Math.round(revenue * 100) / 100,
                    cogs: Math.round(cogs * 100) / 100,
                    fees: Math.round(fees * 100) / 100,
                    grossProfit: Math.round(grossProfit * 100) / 100,
                    netContribution: Math.round(netContribution * 100) / 100,
                });
            }
            return res.json({
                success: true,
                data: channelBreakdown,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch channel profitability' },
            });
        }
    }
    // GET /api/v1/pnl/trends - Daily revenue and profit time series for Recharts
    static async getTrends(req, res) {
        try {
            const days = parseInt(req.query.days) || 30;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const orders = await models_1.Order.find({
                organizationId: req.tenantId,
                placedAt: { $gte: startDate },
            })
                .sort({ placedAt: 1 })
                .lean();
            const orderIds = orders.map((o) => o._id);
            const lines = await models_1.OrderLine.find({ orderId: { $in: orderIds } }).lean();
            // Group by YYYY-MM-DD
            const dateMap = {};
            for (let i = 0; i <= days; i++) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + i);
                const key = d.toISOString().split('T')[0];
                dateMap[key] = { date: key, revenue: 0, cogs: 0, profit: 0, orders: 0 };
            }
            for (const order of orders) {
                const key = new Date(order.placedAt).toISOString().split('T')[0];
                if (dateMap[key]) {
                    const orderLines = lines.filter((l) => l.orderId.toString() === order._id.toString());
                    const orderCogs = orderLines.reduce((sum, l) => sum + (l.unitCost || 0) * (l.quantity || 1), 0);
                    dateMap[key].revenue += order.totalPrice;
                    dateMap[key].cogs += orderCogs;
                    dateMap[key].profit += order.totalPrice - orderCogs - (order.channelFee || 0);
                    dateMap[key].orders += 1;
                }
            }
            const result = Object.values(dateMap).map((d) => ({
                date: d.date,
                revenue: Math.round(d.revenue * 100) / 100,
                cogs: Math.round(d.cogs * 100) / 100,
                profit: Math.round(d.profit * 100) / 100,
                orders: d.orders,
            }));
            return res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch trends' },
            });
        }
    }
}
exports.PnLController = PnLController;
//# sourceMappingURL=pnl.controller.js.map