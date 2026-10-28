"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsController = void 0;
const models_1 = require("../../database/models");
class NotificationsController {
    static async list(req, res) {
        try {
            const { category, channelType, isRead } = req.query;
            const filter = { organizationId: req.tenantId };
            if (category) {
                filter.category = category;
            }
            if (channelType) {
                filter.channelType = channelType;
            }
            if (isRead !== undefined) {
                filter.isRead = isRead === 'true';
            }
            const notifications = await models_1.Notification.find(filter)
                .sort({ createdAt: -1 })
                .limit(100)
                .lean();
            const unreadCount = await models_1.Notification.countDocuments({
                organizationId: req.tenantId,
                isRead: false,
            });
            const totalCount = await models_1.Notification.countDocuments({
                organizationId: req.tenantId,
            });
            return res.json({
                success: true,
                data: {
                    notifications,
                    unreadCount,
                    totalCount,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list notifications' },
            });
        }
    }
    static async markAsRead(req, res) {
        try {
            const { id } = req.params;
            await models_1.Notification.findOneAndUpdate({ _id: id, organizationId: req.tenantId }, { $set: { isRead: true } });
            return res.json({ success: true });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message } });
        }
    }
    static async markAllAsRead(req, res) {
        try {
            await models_1.Notification.updateMany({ organizationId: req.tenantId, isRead: false }, { $set: { isRead: true } });
            return res.json({ success: true });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message } });
        }
    }
    static async delete(req, res) {
        try {
            const { id } = req.params;
            await models_1.Notification.findOneAndDelete({
                _id: id,
                organizationId: req.tenantId,
            });
            return res.json({ success: true });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message } });
        }
    }
    static async clearAll(req, res) {
        try {
            await models_1.Notification.deleteMany({
                organizationId: req.tenantId,
                isRead: true,
            });
            return res.json({ success: true });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message } });
        }
    }
}
exports.NotificationsController = NotificationsController;
//# sourceMappingURL=notifications.controller.js.map