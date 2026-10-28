import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@multichannel/shared';
export declare function requireRole(minimumRole: UserRole): (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=rbac.d.ts.map