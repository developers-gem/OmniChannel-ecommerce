import { Request, Response } from 'express';
export declare class ChannelsController {
    static list(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static create(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static testConnection(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static delete(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static getEbayAuthUrl(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    private static renderEbayCallbackHtml;
    static handleEbayCallback(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static exchangeEbayCode(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    private static renderShopifyCallbackHtml;
    static getShopifyAuthUrl(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static handleShopifyCallback(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
    static exchangeShopifyCode(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
}
//# sourceMappingURL=channels.controller.d.ts.map