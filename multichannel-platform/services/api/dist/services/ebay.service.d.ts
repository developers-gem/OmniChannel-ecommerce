import axios from 'axios';
export interface EbayCredentials {
    host: string;
    token: string;
    isSandbox: boolean;
}
export declare class EbayService {
    /**
     * Determine eBay API host from domain string
     */
    static resolveHost(domainInput?: string): string;
    /**
     * Get eBay OAuth authorization host
     */
    static getOAuthHost(hostOrEnv?: string): string;
    /**
     * Get eBay API host
     */
    static getApiHost(hostOrEnv?: string): string;
    /**
     * Retrieve app client credentials from config or connection overrides
     */
    static getAppCredentials(overrides?: {
        clientId?: string;
        clientSecret?: string;
        ruName?: string;
    }): {
        clientId: string;
        clientSecret: string;
        ruName: string;
    };
    /**
     * Build the OAuth 2.0 Consent Screen URL
     */
    static generateConsentUrl(params: {
        hostOrEnv?: string;
        state: string;
        clientId?: string;
        ruName?: string;
    }): string;
    /**
     * Extract raw authorization code from code string, URL-encoded string, or full redirect URL
     */
    static extractAuthCode(input: string): string;
    /**
     * Exchange OAuth Authorization Code for Access & Refresh Tokens
     */
    static exchangeCodeForTokens(code: string, hostOrEnv?: string, overrides?: {
        clientId?: string;
        clientSecret?: string;
        ruName?: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        refreshTokenExpiresIn?: number;
        tokenType?: string;
    }>;
    /**
     * Refresh an expired or near-expired User Access Token using Refresh Token
     */
    static refreshAccessToken(refreshToken: string, hostOrEnv?: string, overrides?: {
        clientId?: string;
        clientSecret?: string;
    }): Promise<{
        accessToken: string;
        refreshToken?: string;
        expiresIn: number;
        tokenType?: string;
    }>;
    /**
     * Get valid eBay credentials, automatically refreshing access token if needed
     */
    static getValidCredentials(connection: any): Promise<EbayCredentials>;
    /**
     * Extract and decrypt host and access token from a ChannelConnection (synchronous legacy fallback)
     */
    static getCredentials(connection: any): EbayCredentials;
    /**
     * Determine marketplace, currency, and locale from connection or name
     */
    static resolveMarketplace(connectionOrName?: any): {
        marketplaceId: string;
        currency: string;
        locale: string;
    };
    /**
     * Resolve an eBay category ID based on product keywords
     */
    static resolveCategoryId(categoryNameOrTitle?: string): string;
    /**
     * Ensure standard category-specific aspects are provided
     */
    static resolveAspects(title: string, brand?: string, customAspects?: Record<string, string[]>): Record<string, string[]>;
    /**
     * Get an authorized axios instance for eBay REST APIs with custom locale
     */
    static getClient(host: string, token: string, locale?: string): axios.AxiosInstance;
    /**
     * Ensure merchant warehouse location is present on eBay account
     */
    static ensureMerchantLocation(client: any): Promise<string>;
    /**
     * Ensure fulfillment, payment, and return policies exist on eBay account
     */
    static ensureListingPolicies(client: any, marketplaceId: string): Promise<{
        fulfillmentPolicyId: string;
        paymentPolicyId: string;
        returnPolicyId: string;
    }>;
    /**
     * Create or update offer and publish to make the listing live on eBay
     */
    static createOrUpdateAndPublishOffer(client: any, sku: string, params: {
        marketplaceId: string;
        currency: string;
        price: number;
        quantity: number;
        title: string;
        categoryId?: string;
        policies?: {
            fulfillmentPolicyId?: string;
            paymentPolicyId?: string;
            returnPolicyId?: string;
        };
        merchantLocationKey?: string;
    }): Promise<{
        offerId?: string;
        listingId?: string;
        status: string;
        error?: string;
    }>;
    /**
     * Validate credentials live against eBay API
     */
    static validateCredentials(host: string, token: string): Promise<boolean>;
    /**
     * Fetch inventory items with live offer pricing, listingId, and status from eBay
     */
    static getInventoryItems(host: string, token: string, limit?: number, connectionOrMarketplace?: any): Promise<any[]>;
    /**
     * Create or update an inventory item and published offer on eBay
     */
    static setInventoryItem(host: string, token: string, sku: string, productData: {
        title: string;
        description?: string;
        quantity: number;
        price?: number;
        images?: string[];
        brand?: string;
        marketplaceId?: string;
        aspects?: Record<string, string[]>;
    }): Promise<{
        success: boolean;
        listingId?: string;
        offerId?: string;
        error?: string;
    }>;
    /**
     * Delete an inventory item and associated offers from eBay
     */
    static deleteInventoryItem(host: string, token: string, sku: string): Promise<boolean>;
}
//# sourceMappingURL=ebay.service.d.ts.map