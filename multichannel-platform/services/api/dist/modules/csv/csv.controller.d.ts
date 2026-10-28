import { Request, Response } from 'express';
export declare class CsvController {
    static preview(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static import(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getJobs(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static export(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=csv.controller.d.ts.map