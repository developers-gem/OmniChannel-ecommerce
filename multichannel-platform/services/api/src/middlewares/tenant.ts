import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantId || !mongoose.Types.ObjectId.isValid(req.tenantId)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Valid organization context required',
        code: 'TENANT_REQUIRED',
      },
    });
  }
  next();
}
