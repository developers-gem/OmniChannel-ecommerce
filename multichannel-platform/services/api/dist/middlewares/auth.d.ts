import { Request, Response, NextFunction } from 'express';
import { UserClaims } from '@multichannel/shared';
declare global {
    namespace Express {
        interface Request {
            user?: UserClaims;
            tenantId?: string;
        }
    }
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map