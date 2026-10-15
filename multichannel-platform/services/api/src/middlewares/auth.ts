import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UserClaims } from '@multichannel/shared';

declare global {
  namespace Express {
    interface Request {
      user?: UserClaims;
      tenantId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication token required',
        code: 'UNAUTHORIZED',
      },
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const claims = verifyAccessToken(token);
    req.user = claims;
    req.tenantId = claims.organizationId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid or expired authentication token',
        code: 'TOKEN_EXPIRED',
      },
    });
  }
}
