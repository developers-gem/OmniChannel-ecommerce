import axios from 'axios';
export interface ShopifyCredentials {
    domain: string;
    token: string;
}
export declare class ShopifyService {
    /**
     * Extract and decrypt domain and access token from a ChannelConnection
     */
    static getCredentials(connection: any): ShopifyCredentials;
    /**
     * Get an authorized axios instance for the store
     */
    static getClient(domain: string, token: string): axios.AxiosInstance;
    /**
     * Fetch ALL products from a Shopify store using cursor-based pagination (Link header)
     */
    static fetchAllProducts(domain: string, token: string): Promise<any[]>;
    /**
     * Retrieve location ID with fallback strategies
     */
    static getLocationId(domain: string, token: string, inventoryItemId?: string): Promise<string | null>;
    /**
     * Set inventory quantity for an inventory item on Shopify
     */
    static setInventoryLevel(domain: string, token: string, inventoryItemId: string, quantity: number, cachedLocationId?: string): Promise<boolean>;
    /**
     * Update price for a variant on Shopify
     */
    static updateVariantPrice(domain: string, token: string, variantId: string, price: number): Promise<boolean>;
    /**
     * Update an existing product on Shopify
     */
    static updateProduct(domain: string, token: string, shopifyProductId: string, product: {
        title?: string;
        description?: string;
        brand?: string;
        category?: string;
        tags?: string[];
        images?: string[];
    }): Promise<any>;
    /**
     * Push and publish a new canonical product to Shopify
     */
    static publishProduct(domain: string, token: string, product: {
        title: string;
        description?: string;
        brand?: string;
        category?: string;
        tags?: string[];
        images?: string[];
        variants: Array<{
            title?: string;
            sku: string;
            barcode?: string;
            retailPrice: number;
            compareAtPrice?: number;
            weight?: number;
            stockQuantity?: number;
        }>;
    }): Promise<any>;
    /**
     * Delete a product from Shopify store
     */
    static deleteProduct(domain: string, token: string, shopifyProductId: string): Promise<boolean>;
    /**
     * Register essential webhooks on a Shopify store
     */
    static registerWebhooks(domain: string, token: string, connectionId: string): Promise<void>;
    /**
     * Ingest a product from Shopify into ChannelProduct, CanonicalProduct, ProductVariant, and ProductMapping
     */
    static ingestShopifyProduct(params: {
        organizationId: any;
        connection: any;
        shopifyProduct: any;
    }): Promise<{
        canonicalProductId: any;
        mappedCount: number;
    }>;
}
//# sourceMappingURL=shopify.service.d.ts.map