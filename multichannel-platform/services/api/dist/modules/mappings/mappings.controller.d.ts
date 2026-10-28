import { Request, Response } from 'express';
export declare class MappingsController {
    static list(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getSuggestions(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static map(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static bulkMap(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static listUnmapped(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static unmap(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static remap(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static deletePermanent(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static unmapAll(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=mappings.controller.d.ts.map