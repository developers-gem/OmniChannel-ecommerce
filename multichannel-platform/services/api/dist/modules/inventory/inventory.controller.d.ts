import { Request, Response } from 'express';
export declare class InventoryController {
    static list(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static adjust(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static syncChannels(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getMovements(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static setAllocation(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=inventory.controller.d.ts.map