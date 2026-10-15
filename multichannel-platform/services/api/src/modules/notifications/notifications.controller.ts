import { Request, Response } from 'express';
import { Notification } from '../../database/models';

export class NotificationsController {
  static async list(req: Request, res: Response) {
    try {
      const notifications = await Notification.find({
        organizationId: req.tenantId,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const unreadCount = await Notification.countDocuments({
        organizationId: req.tenantId,
        isRead: false,
      });

      return res.json({
        success: true,
        data: {
          notifications,
          unreadCount,
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
}
