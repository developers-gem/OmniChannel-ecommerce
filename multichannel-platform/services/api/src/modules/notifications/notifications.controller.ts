import { Request, Response } from 'express';
import { Notification } from '../../database/models';

export class NotificationsController {
  static async list(req: Request, res: Response) {
    try {
      const { category, channelType, isRead } = req.query;

      const filter: any = { organizationId: req.tenantId };
      if (category) {
        filter.category = category;
      }
      if (channelType) {
        filter.channelType = channelType;
      }
      if (isRead !== undefined) {
        filter.isRead = isRead === 'true';
      }

      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      const unreadCount = await Notification.countDocuments({
        organizationId: req.tenantId,
        isRead: false,
      });

      const totalCount = await Notification.countDocuments({
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
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list notifications' },
      });
    }
  }

  static async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await Notification.findOneAndUpdate(
        { _id: id, organizationId: req.tenantId },
        { $set: { isRead: true } }
      );
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async markAllAsRead(req: Request, res: Response) {
    try {
      await Notification.updateMany(
        { organizationId: req.tenantId, isRead: false },
        { $set: { isRead: true } }
      );
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await Notification.findOneAndDelete({
        _id: id,
        organizationId: req.tenantId,
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async clearAll(req: Request, res: Response) {
    try {
      await Notification.deleteMany({
        organizationId: req.tenantId,
        isRead: true,
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
