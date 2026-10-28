import { Request, Response } from 'express';
export declare class OrdersController {
    static list(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static fulfill(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static cancel(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=orders.controller.d.ts.map