import { Request, Response } from 'express';
export declare class SyncController {
    static listJobs(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static triggerSync(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static importToCanonical(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static retryJob(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=sync.controller.d.ts.map