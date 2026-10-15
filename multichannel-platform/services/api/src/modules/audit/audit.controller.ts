import { Request, Response } from 'express';
import { AuditLog } from '../../database/models';

export class AuditController {
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;

      const total = await AuditLog.countDocuments({ organizationId: req.tenantId });
      const logs = await AuditLog.find({ organizationId: req.tenantId })
        .populate('userId', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        data: logs,
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
        error: { message: error.message || 'Failed to list audit logs' },
      });
    }
  }
}
