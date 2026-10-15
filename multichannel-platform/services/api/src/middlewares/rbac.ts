import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@multichannel/shared';

const roleHierarchy: Record<UserRole, number> = {
  [UserRole.OWNER]: 5,
  [UserRole.ADMIN]: 4,
  [UserRole.MANAGER]: 3,
  [UserRole.MEMBER]: 2,
  [UserRole.VIEWER]: 1,
};

export function requireRole(minimumRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
    }

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions for this operation',
          code: 'FORBIDDEN',
        },
      });
    }

    next();
  };
}
