import { Request, Response } from 'express';
export declare class AuthController {
    static register(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static login(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static refresh(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getMe(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=auth.controller.d.ts.map