import { Request, Response } from 'express';
export declare class ProductsController {
    static list(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static create(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static update(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static delete(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getSummaryCounts(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static listZeroMapped(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static publish(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static bulkPublish(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=products.controller.d.ts.map