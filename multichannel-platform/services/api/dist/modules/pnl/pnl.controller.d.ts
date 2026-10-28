import { Request, Response } from 'express';
export declare class PnLController {
    static getSummary(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getProductProfitability(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getChannelProfitability(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getTrends(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=pnl.controller.d.ts.map