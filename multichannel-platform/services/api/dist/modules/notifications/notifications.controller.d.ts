import { Request, Response } from 'express';
export declare class NotificationsController {
    static list(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static markAsRead(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static markAllAsRead(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static delete(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static clearAll(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=notifications.controller.d.ts.map