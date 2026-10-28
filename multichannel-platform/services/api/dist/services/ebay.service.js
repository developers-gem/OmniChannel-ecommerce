"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EbayService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("../utils/crypto");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const models_1 = require("../database/models");
const shared_1 = require("@multichannel/shared");
class EbayService {
    /**
     * Determine eBay API host from domain string
     */
    static resolveHost(domainInput) {
        const raw = (domainInput || '').toLowerCase().trim();
        if (raw.includes('sandbox') || raw.includes('sbx')) {
            return 'api.sandbox.ebay.com';
        }
        return 'api.ebay.com';
    }
    /**
     * Get eBay OAuth authorization host
     */
    static getOAuthHost(hostOrEnv) {
        const raw = (hostOrEnv || config_1.config.ebay.environment || '').toLowerCase().trim();
        if (raw.includes('sandbox') || raw.includes('sbx')) {
            return 'auth.sandbox.ebay.com';
        }
        return 'auth.ebay.com';
    }
    /**
     * Get eBay API host
     */
    static getApiHost(hostOrEnv) {
        const raw = (hostOrEnv || config_1.config.ebay.environment || '').toLowerCase().trim();
        if (raw.includes('sandbox') || raw.includes('sbx')) {
            return 'api.sandbox.ebay.com';
        }
        return 'api.ebay.com';
    }
    /**
     * Retrieve app client credentials from config or connection overrides
     */
    static getAppCredentials(overrides) {
        return {
            clientId: (overrides?.clientId || config_1.config.ebay.clientId || '').trim(),
            clientSecret: (overrides?.clientSecret || config_1.config.ebay.clientSecret || '').trim(),
            ruName: (overrides?.ruName || config_1.config.ebay.ruName || '').trim(),
        };
    }
    /**
     * Build the OAuth 2.0 Consent Screen URL
     */
    static generateConsentUrl(params) {
        const creds = this.getAppCredentials({ clientId: params.clientId, ruName: params.ruName });
        const oauthHost = this.getOAuthHost(params.hostOrEnv);
        const scopes = encodeURIComponent(config_1.config.ebay.scopes);
        const state = encodeURIComponent(params.state);
        const redirectUri = encodeURIComponent(creds.ruName);
        return `https://${oauthHost}/oauth2/authorize?client_id=${creds.clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}&prompt=login`;
    }
    /**
     * Extract raw authorization code from code string, URL-encoded string, or full redirect URL
     */
    static extractAuthCode(input) {
        if (!input || typeof input !== 'string')
            return '';
        let trimmed = input.trim();
        // If a full URL or query string is provided (e.g. from auth2.ebay.com/oauth2/ThirdPartyAuthSucessFailure?code=...)
        if (trimmed.includes('code=')) {
            try {
                const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.com/${trimmed}`);
                const codeParam = urlObj.searchParams.get('code');
                if (codeParam) {
                    trimmed = codeParam;
                }
            }
            catch {
                const match = trimmed.match(/[?&]code=([^&#\s]+)/);
                if (match && match[1]) {
                    trimmed = match[1];
                }
            }
        }
        // Decode URI component if URL-encoded
        if (trimmed.includes('%')) {
            try {
                trimmed = decodeURIComponent(trimmed);
            }
            catch {
                // keep as is
            }
        }
        return trimmed;
    }
    /**
     * Exchange OAuth Authorization Code for Access & Refresh Tokens
     */
    static async exchangeCodeForTokens(code, hostOrEnv, overrides) {
        const creds = this.getAppCredentials(overrides);
        const apiHost = this.getApiHost(hostOrEnv);
        const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        const cleanCode = this.extractAuthCode(code);
        if (!cleanCode || cleanCode.length < 5) {
            throw new Error('A valid eBay authorization code is required for token exchange');
        }
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', cleanCode);
        params.append('redirect_uri', creds.ruName);
        try {
            const res = await axios_1.default.post(`https://${apiHost}/identity/v1/oauth2/token`, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${basicAuth}`,
                },
                timeout: 20000,
            });
            return {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresIn: res.data.expires_in,
                refreshTokenExpiresIn: res.data.refresh_token_expires_in,
                tokenType: res.data.token_type,
            };
        }
        catch (err) {
            const errorDetail = err.response?.data?.error_description ||
                err.response?.data?.error ||
                err.message;
            logger_1.logger.error(`[eBay OAuth] Code exchange failed: ${errorDetail}`);
            throw new Error(`Failed to exchange authorization code with eBay: ${errorDetail}`);
        }
    }
    /**
     * Refresh an expired or near-expired User Access Token using Refresh Token
     */
    static async refreshAccessToken(refreshToken, hostOrEnv, overrides) {
        const creds = this.getAppCredentials(overrides);
        const apiHost = this.getApiHost(hostOrEnv);
        const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken.trim());
        try {
            const res = await axios_1.default.post(`https://${apiHost}/identity/v1/oauth2/token`, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${basicAuth}`,
                },
                timeout: 20000,
            });
            return {
                accessToken: res.data.access_token,
                refreshToken: res.data.refresh_token,
                expiresIn: res.data.expires_in,
                tokenType: res.data.token_type,
            };
        }
        catch (err) {
            const errorDetail = err.response?.data?.error_description ||
                err.response?.data?.error ||
                err.message;
            logger_1.logger.error(`[eBay OAuth] Token refresh failed: ${errorDetail}`);
            throw new Error(`Failed to refresh eBay token: ${errorDetail}`);
        }
    }
    /**
     * Get valid eBay credentials, automatically refreshing access token if needed
     */
    static async getValidCredentials(connection) {
        const domain = connection.config?.storeDomain || connection.config?.baseUrl || 'api.sandbox.ebay.com';
        const host = this.resolveHost(domain);
        const isSandbox = host.includes('sandbox');
        const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
        const rawRefreshEnc = connection.credentials?.refreshToken;
        const rawExpiresAt = connection.credentials?.expiresAt;
        let expiresAt = null;
        if (rawExpiresAt) {
            expiresAt = new Date(rawExpiresAt);
        }
        // Refresh if expiring within 5 minutes or already expired or missing expiry
        const isNearExpiry = !expiresAt || Date.now() >= expiresAt.getTime() - 5 * 60 * 1000;
        if (rawRefreshEnc && (isNearExpiry || !rawTokenEnc)) {
            try {
                const plainRefreshToken = (0, crypto_1.decryptSecret)(rawRefreshEnc).trim();
                const refreshed = await this.refreshAccessToken(plainRefreshToken, host, {
                    clientId: connection.config?.clientId,
                    clientSecret: connection.config?.clientSecret,
                });
                const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn || 7200) * 1000);
                const updatedCredentials = {
                    ...(connection.credentials || {}),
                    accessToken: (0, crypto_1.encryptSecret)(refreshed.accessToken),
                    expiresAt: newExpiresAt,
                };
                if (refreshed.refreshToken && refreshed.refreshToken !== plainRefreshToken) {
                    updatedCredentials.refreshToken = (0, crypto_1.encryptSecret)(refreshed.refreshToken);
                }
                await models_1.ChannelConnection.findByIdAndUpdate(connection._id, {
                    $set: {
                        credentials: updatedCredentials,
                        status: shared_1.ChannelStatus.ACTIVE,
                        lastSyncAt: new Date(),
                    },
                });
                if (connection.credentials) {
                    connection.credentials = updatedCredentials;
                }
                connection.status = shared_1.ChannelStatus.ACTIVE;
                logger_1.logger.info(`[eBay OAuth] Automatically renewed access token for store: ${connection.name || connection._id}`);
                return { host, token: refreshed.accessToken, isSandbox };
            }
            catch (refreshErr) {
                logger_1.logger.error(`[eBay OAuth] Silent refresh failed for store ${connection.name}: ${refreshErr.message}`);
                // Fallback to existing access token if still unexpired
                if (rawTokenEnc && expiresAt && Date.now() < expiresAt.getTime()) {
                    const token = (0, crypto_1.decryptSecret)(rawTokenEnc).trim();
                    return { host, token, isSandbox };
                }
                throw new Error(`eBay session expired and automatic renewal failed: ${refreshErr.message}`);
            }
        }
        if (!rawTokenEnc) {
            throw new Error(`No access token found for eBay connection: ${connection.name || connection._id}`);
        }
        const token = (0, crypto_1.decryptSecret)(rawTokenEnc).trim();
        return { host, token, isSandbox };
    }
    /**
     * Extract and decrypt host and access token from a ChannelConnection (synchronous legacy fallback)
     */
    static getCredentials(connection) {
        const domain = connection.config?.storeDomain || connection.config?.baseUrl || 'api.sandbox.ebay.com';
        const host = this.resolveHost(domain);
        const isSandbox = host.includes('sandbox');
        const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
        if (!rawTokenEnc) {
            throw new Error(`No access token found for eBay connection: ${connection.name || connection._id}`);
        }
        const token = (0, crypto_1.decryptSecret)(rawTokenEnc).trim();
        return { host, token, isSandbox };
    }
    /**
     * Determine marketplace, currency, and locale from connection or name
     */
    static resolveMarketplace(connectionOrName) {
        let name = '';
        let domain = '';
        if (typeof connectionOrName === 'string') {
            name = connectionOrName;
        }
        else if (connectionOrName) {
            name = connectionOrName.name || '';
            domain = connectionOrName.config?.storeDomain || connectionOrName.config?.marketplaceId || '';
        }
        const combined = `${name} ${domain}`.toLowerCase();
        if (combined.includes('uk') || combined.includes('gb') || combined.includes('ebay_gb')) {
            return { marketplaceId: 'EBAY_GB', currency: 'GBP', locale: 'en-GB' };
        }
        return { marketplaceId: 'EBAY_US', currency: 'USD', locale: 'en-US' };
    }
    /**
     * Resolve an eBay category ID based on product keywords
     */
    static resolveCategoryId(categoryNameOrTitle) {
        const text = (categoryNameOrTitle || '').toLowerCase();
        if (text.includes('ink') || text.includes('toner') || text.includes('cartridge')) {
            return '168061'; // Ink Cartridges
        }
        if (text.includes('watch') || text.includes('fitness') || text.includes('tracker')) {
            return '31387'; // Wristwatches
        }
        if (text.includes('headphone') || text.includes('earphone') || text.includes('audio')) {
            return '111694'; // Headphones
        }
        if (text.includes('pen') || text.includes('stationery') || text.includes('notebook')) {
            return '967'; // Pens & Writing Instruments
        }
        if (text.includes('snowboard') || text.includes('ski') || text.includes('sport')) {
            return '21248'; // Snowboarding
        }
        return '168061'; // Safe default
    }
    /**
     * Ensure standard category-specific aspects are provided
     */
    static resolveAspects(title, brand, customAspects) {
        const aspects = { ...(customAspects || {}) };
        if (!aspects['Brand']) {
            aspects['Brand'] = [brand || 'Generic'];
        }
        if (!aspects['Type']) {
            aspects['Type'] = ['Original'];
        }
        const t = title.toLowerCase();
        if (t.includes('ink') || t.includes('cartridge')) {
            if (!aspects['Compatible Brand'])
                aspects['Compatible Brand'] = ['For HP'];
            if (!aspects['Colour'])
                aspects['Colour'] = ['Black'];
            if (!aspects['Print Technology'])
                aspects['Print Technology'] = ['Inkjet'];
        }
        if (t.includes('headphone') || t.includes('earphone')) {
            if (!aspects['Connectivity'])
                aspects['Connectivity'] = ['Bluetooth'];
            if (!aspects['Model'])
                aspects['Model'] = ['Universal'];
        }
        return aspects;
    }
    /**
     * Get an authorized axios instance for eBay REST APIs with custom locale
     */
    static getClient(host, token, locale = 'en-US') {
        return axios_1.default.create({
            baseURL: `https://${host}`,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'Accept-Language': locale,
                'Content-Language': locale,
            },
            timeout: 20000,
        });
    }
    /**
     * Ensure merchant warehouse location is present on eBay account
     */
    static async ensureMerchantLocation(client) {
        try {
            const res = await client.get('/sell/inventory/v1/location?limit=5');
            const locs = res.data?.locations || [];
            if (locs.length > 0 && locs[0].merchantLocationKey) {
                return locs[0].merchantLocationKey;
            }
        }
        catch (e) {
            logger_1.logger.warn(`Could not list eBay merchant locations: ${e.message}`);
        }
        const defaultKey = 'sandbox-warehouse-1';
        try {
            await client.post(`/sell/inventory/v1/location/${defaultKey}`, {
                location: {
                    address: {
                        addressLine1: '123 Logistics Way',
                        city: 'London',
                        stateOrProvince: 'London',
                        postalCode: 'EC1A 1BB',
                        country: 'GB',
                    },
                },
                name: 'Main Warehouse',
                merchantLocationStatus: 'ENABLED',
                locationTypes: ['WAREHOUSE'],
            });
            return defaultKey;
        }
        catch {
            return defaultKey;
        }
    }
    /**
     * Ensure fulfillment, payment, and return policies exist on eBay account
     */
    static async ensureListingPolicies(client, marketplaceId) {
        let fulfillmentPolicyId = '';
        let paymentPolicyId = '';
        let returnPolicyId = '';
        const isGB = marketplaceId === 'EBAY_GB';
        // 1. Fulfillment policy
        try {
            const fRes = await client.get(`/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`);
            const fList = fRes.data?.fulfillmentPolicies || [];
            if (fList.length > 0) {
                fulfillmentPolicyId = fList[0].fulfillmentPolicyId;
            }
            else {
                const createFRes = await client.post('/sell/account/v1/fulfillment_policy', {
                    name: `Standard Free Shipping ${isGB ? 'UK' : 'US'}`,
                    description: 'Standard domestic free shipping',
                    marketplaceId,
                    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
                    handlingTime: { value: 1, unit: 'DAY' },
                    shippingOptions: [
                        {
                            costType: 'FLAT_RATE',
                            optionType: 'DOMESTIC',
                            shippingServices: [
                                {
                                    shippingServiceCode: isGB ? 'UK_RoyalMailFirstClassStandard' : 'USPSPriority',
                                    shippingCost: { value: '0.0', currency: isGB ? 'GBP' : 'USD' },
                                    freeShipping: true,
                                    sortOrder: 1,
                                },
                            ],
                        },
                    ],
                });
                fulfillmentPolicyId = createFRes.data?.fulfillmentPolicyId || '';
            }
        }
        catch (err) {
            logger_1.logger.warn(`Failed to resolve fulfillment policy for ${marketplaceId}: ${err.message}`);
        }
        // 2. Payment policy
        try {
            const pRes = await client.get(`/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`);
            const pList = pRes.data?.paymentPolicies || [];
            if (pList.length > 0) {
                paymentPolicyId = pList[0].paymentPolicyId;
            }
            else {
                const createPRes = await client.post('/sell/account/v1/payment_policy', {
                    name: `Immediate Payment ${marketplaceId}`,
                    marketplaceId,
                    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
                    immediatePay: true,
                });
                paymentPolicyId = createPRes.data?.paymentPolicyId || '';
            }
        }
        catch (err) {
            logger_1.logger.warn(`Failed to resolve payment policy for ${marketplaceId}: ${err.message}`);
        }
        // 3. Return policy
        try {
            const rRes = await client.get(`/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`);
            const rList = rRes.data?.returnPolicies || [];
            if (rList.length > 0) {
                returnPolicyId = rList[0].returnPolicyId;
            }
            else {
                const createRRes = await client.post('/sell/account/v1/return_policy', {
                    name: `Standard 30 Day Returns ${marketplaceId}`,
                    marketplaceId,
                    categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
                    returnsAccepted: true,
                    returnPeriod: { value: 30, unit: 'DAY' },
                    returnShippingCostPayer: 'BUYER',
                });
                returnPolicyId = createRRes.data?.returnPolicyId || '';
            }
        }
        catch (err) {
            logger_1.logger.warn(`Failed to resolve return policy for ${marketplaceId}: ${err.message}`);
        }
        return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
    }
    /**
     * Create or update offer and publish to make the listing live on eBay
     */
    static async createOrUpdateAndPublishOffer(client, sku, params) {
        const { marketplaceId, currency, price, quantity, categoryId, policies, merchantLocationKey } = params;
        let existingOfferId;
        let existingListingId;
        let existingStatus;
        try {
            const offRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
            const offers = offRes.data?.offers || [];
            const match = offers.find((o) => o.marketplaceId === marketplaceId) || offers[0];
            if (match) {
                existingOfferId = match.offerId;
                existingListingId = match.listing?.listingId;
                existingStatus = match.status;
            }
        }
        catch {
            // 404 is expected when no offer exists yet
        }
        const offerPayload = {
            sku,
            marketplaceId,
            format: 'FIXED_PRICE',
            availableQuantity: Math.max(1, quantity),
            categoryId: categoryId || this.resolveCategoryId(params.title),
            pricingSummary: {
                price: {
                    currency,
                    value: Number(price || 1).toFixed(2),
                },
            },
            merchantLocationKey: merchantLocationKey || 'sandbox-warehouse-1',
        };
        if (policies?.fulfillmentPolicyId && policies?.paymentPolicyId && policies?.returnPolicyId) {
            offerPayload.listingPolicies = {
                fulfillmentPolicyId: policies.fulfillmentPolicyId,
                paymentPolicyId: policies.paymentPolicyId,
                returnPolicyId: policies.returnPolicyId,
            };
        }
        let offerId = existingOfferId;
        if (existingOfferId) {
            try {
                await client.put(`/sell/inventory/v1/offer/${existingOfferId}`, offerPayload);
            }
            catch (putErr) {
                logger_1.logger.warn(`Could not update existing offer ${existingOfferId}: ${putErr.message}`);
            }
        }
        else {
            try {
                const postRes = await client.post('/sell/inventory/v1/offer', offerPayload);
                offerId = postRes.data?.offerId;
            }
            catch (postErr) {
                const msg = postErr.response?.data?.errors?.[0]?.message || postErr.message;
                logger_1.logger.error(`Could not create offer for SKU ${sku}: ${msg}`);
                return { status: 'FAILED_OFFER_CREATE', error: msg };
            }
        }
        if (!offerId) {
            return { status: 'NO_OFFER_ID' };
        }
        // If already published, the PUT update was enough
        if (existingStatus === 'PUBLISHED' && existingListingId) {
            return { offerId, listingId: existingListingId, status: 'PUBLISHED' };
        }
        // Publish offer
        try {
            const pubRes = await client.post(`/sell/inventory/v1/offer/${offerId}/publish`);
            const listingId = pubRes.data?.listingId || existingListingId;
            logger_1.logger.info(`Successfully published offer ${offerId} for SKU ${sku} on eBay! Listing ID: ${listingId}`);
            return { offerId, listingId, status: 'PUBLISHED' };
        }
        catch (pubErr) {
            const errMsg = pubErr.response?.data?.errors?.[0]?.message || pubErr.message;
            logger_1.logger.warn(`Publish offer ${offerId} for SKU ${sku} returned: ${errMsg}`);
            return { offerId, listingId: existingListingId, status: 'PUBLISH_PENDING', error: errMsg };
        }
    }
    /**
     * Validate credentials live against eBay API
     */
    static async validateCredentials(host, token) {
        const client = this.getClient(host, token);
        try {
            const res = await client.get('/sell/inventory/v1/inventory_item?limit=1');
            return res.status >= 200 && res.status < 300;
        }
        catch (err) {
            const status = err.response?.status;
            if (status && status !== 401) {
                try {
                    const fallbackRes = await client.get('/sell/account/v1/privilege');
                    if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
                        return true;
                    }
                }
                catch {
                    // fallback failed
                }
            }
            const errorMsg = err.response?.data?.errors?.[0]?.message ||
                err.response?.data?.errors?.[0]?.longMessage ||
                err.message;
            logger_1.logger.warn(`eBay credential validation failed (${status}): ${errorMsg}`);
            const detailedError = new Error(`eBay Authentication Failed (${status || 'Connection Error'}): ${errorMsg}`);
            detailedError.status = status;
            throw detailedError;
        }
    }
    /**
     * Fetch inventory items with live offer pricing, listingId, and status from eBay
     */
    static async getInventoryItems(host, token, limit = 100, connectionOrMarketplace) {
        const { locale, currency } = this.resolveMarketplace(connectionOrMarketplace);
        const client = this.getClient(host, token, locale);
        try {
            const res = await client.get(`/sell/inventory/v1/inventory_item?limit=${limit}`);
            const rawItems = res.data?.inventoryItems || [];
            const enrichedItems = [];
            for (const item of rawItems) {
                let price = 0;
                let itemCurrency = currency;
                let listingId = '';
                let offerStatus = 'UNPUBLISHED';
                let offerId = '';
                try {
                    const offRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(item.sku)}`);
                    const offers = offRes.data?.offers || [];
                    if (offers.length > 0) {
                        const primaryOffer = offers.find((o) => o.status === 'PUBLISHED') || offers[0];
                        offerId = primaryOffer.offerId;
                        offerStatus = primaryOffer.status || 'UNPUBLISHED';
                        listingId = primaryOffer.listing?.listingId || '';
                        const pVal = primaryOffer.pricingSummary?.price?.value;
                        if (pVal) {
                            price = parseFloat(pVal);
                        }
                        if (primaryOffer.pricingSummary?.price?.currency) {
                            itemCurrency = primaryOffer.pricingSummary.price.currency;
                        }
                    }
                }
                catch {
                    // No offer found
                }
                const quantity = item.availability?.shipToLocationAvailability?.quantity ??
                    item.availability?.shipToHomeQuantity ??
                    0;
                enrichedItems.push({
                    sku: item.sku,
                    title: item.product?.title || item.sku,
                    description: item.product?.description || '',
                    price,
                    currency: itemCurrency,
                    listingId,
                    offerId,
                    offerStatus,
                    isPublished: offerStatus === 'PUBLISHED',
                    quantity,
                    images: item.product?.imageUrls || [],
                    aspects: item.product?.aspects || {},
                    raw: item,
                });
            }
            return enrichedItems;
        }
        catch (err) {
            logger_1.logger.warn(`Could not fetch eBay inventory items: ${err.message}`);
            return [];
        }
    }
    /**
     * Create or update an inventory item and published offer on eBay
     */
    static async setInventoryItem(host, token, sku, productData) {
        const marketplace = productData.marketplaceId || (sku.includes('GB') || host.includes('uk') ? 'EBAY_GB' : 'EBAY_GB');
        const { locale, currency, marketplaceId } = this.resolveMarketplace(marketplace);
        const client = this.getClient(host, token, locale);
        try {
            const aspects = this.resolveAspects(productData.title, productData.brand, productData.aspects);
            const validImages = (productData.images || []).filter((url) => typeof url === 'string' && url.startsWith('http'));
            if (validImages.length === 0) {
                validImages.push('https://i.ebayimg.com/images/g/default/s-l1600.jpg');
            }
            const payload = {
                locale,
                availability: {
                    shipToLocationAvailability: {
                        quantity: Math.max(0, productData.quantity),
                    },
                },
                condition: 'NEW',
                product: {
                    title: productData.title.slice(0, 80),
                    description: productData.description || productData.title,
                    imageUrls: validImages,
                    aspects,
                },
            };
            const invRes = await client.put(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, payload);
            if (invRes.status !== 204 && invRes.status !== 200) {
                return { success: false, error: `Failed to set inventory item (${invRes.status})` };
            }
            let listingId;
            let offerId;
            if (typeof productData.price === 'number' && productData.price > 0) {
                const merchantLocationKey = await this.ensureMerchantLocation(client);
                const policies = await this.ensureListingPolicies(client, marketplaceId);
                const offerResult = await this.createOrUpdateAndPublishOffer(client, sku, {
                    marketplaceId,
                    currency,
                    price: productData.price,
                    quantity: productData.quantity,
                    title: productData.title,
                    policies,
                    merchantLocationKey,
                });
                listingId = offerResult.listingId;
                offerId = offerResult.offerId;
            }
            return { success: true, listingId, offerId };
        }
        catch (err) {
            const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
            logger_1.logger.error(`Failed to set eBay inventory item for SKU ${sku}: ${errMsg}`);
            return { success: false, error: errMsg };
        }
    }
    /**
     * Delete an inventory item and associated offers from eBay
     */
    static async deleteInventoryItem(host, token, sku) {
        const client = this.getClient(host, token);
        try {
            try {
                const offRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
                const offers = offRes.data?.offers || [];
                for (const o of offers) {
                    if (o.status === 'PUBLISHED' && o.offerId) {
                        await client.post(`/sell/inventory/v1/offer/${o.offerId}/withdraw`).catch(() => { });
                    }
                    if (o.offerId) {
                        await client.delete(`/sell/inventory/v1/offer/${o.offerId}`).catch(() => { });
                    }
                }
            }
            catch { }
            const res = await client.delete(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
            logger_1.logger.info(`Successfully deleted eBay inventory item for SKU ${sku} on ${host}`);
            return res.status === 204 || res.status === 200;
        }
        catch (err) {
            if (err.response?.status === 404) {
                logger_1.logger.info(`eBay inventory item for SKU ${sku} was already deleted or not found on ${host}`);
                return true;
            }
            logger_1.logger.error(`Failed to delete eBay inventory item for SKU ${sku} on ${host}: ${err.message}`);
            return false;
        }
    }
}
exports.EbayService = EbayService;
//# sourceMappingURL=ebay.service.js.map