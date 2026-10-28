import { Response } from 'express';
export declare class WebhooksController {
    /**
     * POST /api/v1/webhooks/shopify/:connectionId
     * Handles Shopify webhook notifications (orders/create, inventory_levels/update, products/update)
     */
    static handleShopify(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * POST /api/v1/webhooks/ebay/:connectionId
     * Handles eBay marketplace notifications
     */
    static handleEbay(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    /**
     * POST /api/v1/webhooks/custom/:connectionId
     * Handles custom webstore webhook notifications with HMAC-SHA256
     */
    static handleCustom(req: any, res: Response): Promise<Response<any, Record<string, any>>>;
    private static processShopifyOrder;
    private static processShopifyInventoryUpdate;
    private static processShopifyProductCreate;
    private static processShopifyProductUpdate;
}
//# sourceMappingURL=webhooks.controller.d.ts.map