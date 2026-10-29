import axios from 'axios';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  ChannelConnection,
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  ChannelProduct,
  ProductMapping,
} from '../database/models';
import {
  ChannelStatus,
  ChannelType,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
  MappingConfidence,
  ProductStatus,
} from '@multichannel/shared';

export interface EbayCredentials {
  host: string;
  token: string;
  isSandbox: boolean;
}

export class EbayService {
  /**
   * Determine eBay API host from domain string
   */
  static resolveHost(domainInput?: string): string {
    const raw = (domainInput || '').toLowerCase().trim();
    if (raw.includes('sandbox') || raw.includes('sbx')) {
      return 'api.sandbox.ebay.com';
    }
    return 'api.ebay.com';
  }

  /**
   * Get eBay OAuth authorization host
   */
  static getOAuthHost(hostOrEnv?: string): string {
    const raw = (hostOrEnv || config.ebay.environment || '').toLowerCase().trim();
    if (raw.includes('sandbox') || raw.includes('sbx')) {
      return 'auth.sandbox.ebay.com';
    }
    return 'auth.ebay.com';
  }

  /**
   * Get eBay API host
   */
  static getApiHost(hostOrEnv?: string): string {
    const raw = (hostOrEnv || config.ebay.environment || '').toLowerCase().trim();
    if (raw.includes('sandbox') || raw.includes('sbx')) {
      return 'api.sandbox.ebay.com';
    }
    return 'api.ebay.com';
  }

  /**
   * Retrieve app client credentials from config or connection overrides
   */
  static getAppCredentials(overrides?: { clientId?: string; clientSecret?: string; ruName?: string }) {
    return {
      clientId: (overrides?.clientId || config.ebay.clientId || '').trim(),
      clientSecret: (overrides?.clientSecret || config.ebay.clientSecret || '').trim(),
      ruName: (overrides?.ruName || config.ebay.ruName || '').trim(),
    };
  }

  /**
   * Build the OAuth 2.0 Consent Screen URL
   */
  static generateConsentUrl(params: {
    hostOrEnv?: string;
    state: string;
    clientId?: string;
    ruName?: string;
  }): string {
    const creds = this.getAppCredentials({ clientId: params.clientId, ruName: params.ruName });
    const oauthHost = this.getOAuthHost(params.hostOrEnv);
    const scopes = encodeURIComponent(config.ebay.scopes);
    const state = encodeURIComponent(params.state);
    const redirectUri = encodeURIComponent(creds.ruName);

    return `https://${oauthHost}/oauth2/authorize?client_id=${creds.clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scopes}&state=${state}&prompt=login`;
  }

  /**
   * Extract raw authorization code from code string, URL-encoded string, or full redirect URL
   */
  static extractAuthCode(input: string): string {
    if (!input || typeof input !== 'string') return '';
    let trimmed = input.trim();

    // If a full URL or query string is provided (e.g. from auth2.ebay.com/oauth2/ThirdPartyAuthSucessFailure?code=...)
    if (trimmed.includes('code=')) {
      try {
        const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.com/${trimmed}`);
        const codeParam = urlObj.searchParams.get('code');
        if (codeParam) {
          trimmed = codeParam;
        }
      } catch {
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
      } catch {
        // keep as is
      }
    }

    return trimmed;
  }

  /**
   * Exchange OAuth Authorization Code for Access & Refresh Tokens
   */
  static async exchangeCodeForTokens(
    code: string,
    hostOrEnv?: string,
    overrides?: { clientId?: string; clientSecret?: string; ruName?: string }
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshTokenExpiresIn?: number;
    tokenType?: string;
  }> {
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
      const res = await axios.post(`https://${apiHost}/identity/v1/oauth2/token`, params.toString(), {
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
    } catch (err: any) {
      const errorDetail =
        err.response?.data?.error_description ||
        err.response?.data?.error ||
        err.message;
      logger.error(`[eBay OAuth] Code exchange failed: ${errorDetail}`);
      throw new Error(`Failed to exchange authorization code with eBay: ${errorDetail}`);
    }
  }

  /**
   * Refresh an expired or near-expired User Access Token using Refresh Token
   */
  static async refreshAccessToken(
    refreshToken: string,
    hostOrEnv?: string,
    overrides?: { clientId?: string; clientSecret?: string }
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tokenType?: string;
  }> {
    const creds = this.getAppCredentials(overrides);
    const apiHost = this.getApiHost(hostOrEnv);
    const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken.trim());

    try {
      const res = await axios.post(`https://${apiHost}/identity/v1/oauth2/token`, params.toString(), {
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
    } catch (err: any) {
      const errorDetail =
        err.response?.data?.error_description ||
        err.response?.data?.error ||
        err.message;
      logger.error(`[eBay OAuth] Token refresh failed: ${errorDetail}`);
      throw new Error(`Failed to refresh eBay token: ${errorDetail}`);
    }
  }

  /**
   * Get valid eBay credentials, automatically refreshing access token if needed
   */
  static async getValidCredentials(connection: any): Promise<EbayCredentials> {
    const domain = connection.config?.storeDomain || connection.config?.baseUrl || 'api.sandbox.ebay.com';
    const host = this.resolveHost(domain);
    const isSandbox = host.includes('sandbox');

    const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
    const rawRefreshEnc = connection.credentials?.refreshToken;
    const rawExpiresAt = connection.credentials?.expiresAt;

    let expiresAt: Date | null = null;
    if (rawExpiresAt) {
      expiresAt = new Date(rawExpiresAt);
    }

    // Refresh if expiring within 5 minutes or already expired or missing expiry
    const isNearExpiry = !expiresAt || Date.now() >= expiresAt.getTime() - 5 * 60 * 1000;

    if (rawRefreshEnc && (isNearExpiry || !rawTokenEnc)) {
      try {
        const plainRefreshToken = decryptSecret(rawRefreshEnc).trim();
        const refreshed = await this.refreshAccessToken(plainRefreshToken, host, {
          clientId: connection.config?.clientId,
          clientSecret: connection.config?.clientSecret,
        });

        const newExpiresAt = new Date(Date.now() + (refreshed.expiresIn || 7200) * 1000);
        const updatedCredentials = {
          ...(connection.credentials || {}),
          accessToken: encryptSecret(refreshed.accessToken),
          expiresAt: newExpiresAt,
        };

        if (refreshed.refreshToken && refreshed.refreshToken !== plainRefreshToken) {
          updatedCredentials.refreshToken = encryptSecret(refreshed.refreshToken);
        }

        await ChannelConnection.findByIdAndUpdate(connection._id, {
          $set: {
            credentials: updatedCredentials,
            status: ChannelStatus.ACTIVE,
            lastSyncAt: new Date(),
          },
        });

        if (connection.credentials) {
          connection.credentials = updatedCredentials;
        }
        connection.status = ChannelStatus.ACTIVE;

        logger.info(`[eBay OAuth] Automatically renewed access token for store: ${connection.name || connection._id}`);
        return { host, token: refreshed.accessToken, isSandbox };
      } catch (refreshErr: any) {
        logger.error(`[eBay OAuth] Silent refresh failed for store ${connection.name}: ${refreshErr.message}`);
        // Fallback to existing access token if still unexpired
        if (rawTokenEnc && expiresAt && Date.now() < expiresAt.getTime()) {
          const token = decryptSecret(rawTokenEnc).trim();
          return { host, token, isSandbox };
        }
        throw new Error(`eBay session expired and automatic renewal failed: ${refreshErr.message}`);
      }
    }

    if (!rawTokenEnc) {
      throw new Error(`No access token found for eBay connection: ${connection.name || connection._id}`);
    }

    const token = decryptSecret(rawTokenEnc).trim();
    return { host, token, isSandbox };
  }

  /**
   * Extract and decrypt host and access token from a ChannelConnection (synchronous legacy fallback)
   */
  static getCredentials(connection: any): EbayCredentials {
    const domain = connection.config?.storeDomain || connection.config?.baseUrl || 'api.sandbox.ebay.com';
    const host = this.resolveHost(domain);
    const isSandbox = host.includes('sandbox');

    const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
    if (!rawTokenEnc) {
      throw new Error(`No access token found for eBay connection: ${connection.name || connection._id}`);
    }

    const token = decryptSecret(rawTokenEnc).trim();
    return { host, token, isSandbox };
  }

  /**
   * Determine marketplace, currency, and locale from connection or name
   */
  static resolveMarketplace(connectionOrName?: any): { marketplaceId: string; currency: string; locale: string } {
    let name = '';
    let domain = '';
    if (typeof connectionOrName === 'string') {
      name = connectionOrName;
    } else if (connectionOrName) {
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
  static resolveCategoryId(categoryNameOrTitle?: string): string {
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
  static resolveAspects(title: string, brand?: string, customAspects?: Record<string, string[]>): Record<string, string[]> {
    const aspects: Record<string, string[]> = { ...(customAspects || {}) };
    const effectiveBrand = brand && brand !== 'Generic' ? brand : 'Brother';
    if (!aspects['Brand']) {
      aspects['Brand'] = [brand || 'Brother'];
    }
    if (!aspects['Type']) {
      aspects['Type'] = ['Original'];
    }
    const t = (title + ' ' + (brand || '')).toLowerCase();
    const isHeadphones = t.includes('headphone') || t.includes('earphone') || t.includes('audio');
    const isWatch = t.includes('watch') || t.includes('fitness');
    const isStationery = t.includes('pen') || t.includes('stationery') || t.includes('notebook');

    if (!isHeadphones && !isWatch && !isStationery) {
      // Default to Ink & Toner category requirements
      if (!aspects['Compatible Brand']) {
        const comp = effectiveBrand.replace(/^For\s+/i, '');
        aspects['Compatible Brand'] = [`For ${comp}`];
      }
      if (!aspects['Colour']) {
        if (t.includes('yellow') || t.includes('xly') || /\by\b/.test(t)) aspects['Colour'] = ['Yellow'];
        else if (t.includes('magenta') || t.includes('xlm') || /\bm\b/.test(t)) aspects['Colour'] = ['Magenta'];
        else if (t.includes('cyan') || t.includes('xlc') || /\bc\b/.test(t)) aspects['Colour'] = ['Cyan'];
        else aspects['Colour'] = ['Black'];
      }
      if (!aspects['Print Technology']) aspects['Print Technology'] = ['Inkjet'];
    }

    if (isHeadphones) {
      if (!aspects['Connectivity']) aspects['Connectivity'] = ['Bluetooth'];
      if (!aspects['Model']) aspects['Model'] = ['Universal'];
    }
    return aspects;
  }

  /**
   * Get an authorized axios instance for eBay REST APIs with custom locale
   */
  static getClient(host: string, token: string, locale = 'en-US') {
    return axios.create({
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
  static async ensureMerchantLocation(client: any, marketplaceId = 'EBAY_GB'): Promise<string> {
    const isUK = marketplaceId === 'EBAY_GB';
    const targetCountry = isUK ? 'GB' : 'US';


    try {
      const res = await client.get('/sell/inventory/v1/location?limit=20');
      const locs = res.data?.locations || [];

      // Find an enabled location that matches the required country
      const matched = locs.find(
        (l: any) =>
          l.merchantLocationStatus === 'ENABLED' &&
          (l.location?.address?.country || '').toUpperCase() === targetCountry
      );

      if (matched?.merchantLocationKey) {
        return matched.merchantLocationKey;
      }

      // If any enabled location has a country match
      const countryMatch = locs.find(
        (l: any) => (l.location?.address?.country || '').toUpperCase() === targetCountry
      );
      if (countryMatch?.merchantLocationKey) {
        return countryMatch.merchantLocationKey;
      }
    } catch (e: any) {
      logger.warn(`Could not list eBay merchant locations: ${e.message}`);
    }

    const defaultKey = isUK ? 'uk-warehouse-1' : 'us-warehouse-1';
    try {
      await client.post(`/sell/inventory/v1/location/${defaultKey}`, {
        location: {
          address: isUK
            ? {
              addressLine1: '123 Logistics Way',
              city: 'London',
              stateOrProvince: 'London',
              postalCode: 'EC1A 1BB',
              country: 'GB',
            }
            : {
              addressLine1: '2145 Hamilton Ave',
              city: 'San Jose',
              stateOrProvince: 'CA',
              postalCode: '95008',
              country: 'US',
            },
        },
        name: isUK ? 'UK Main Warehouse' : 'US Main Warehouse',
        merchantLocationStatus: 'ENABLED',
        locationTypes: ['WAREHOUSE'],
      });
      return defaultKey;
    } catch {
      return defaultKey;
    }
  }

  /**
   * Ensure fulfillment, payment, and return policies exist on eBay account
   */
  static async ensureListingPolicies(
    client: any,
    marketplaceId: string
  ): Promise<{ fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string }> {
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
      } else {
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
    } catch (err: any) {
      logger.warn(`Failed to resolve fulfillment policy for ${marketplaceId}: ${err.message}`);
    }

    // 2. Payment policy
    try {
      const pRes = await client.get(`/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`);
      const pList = pRes.data?.paymentPolicies || [];
      if (pList.length > 0) {
        paymentPolicyId = pList[0].paymentPolicyId;
      } else {
        const createPRes = await client.post('/sell/account/v1/payment_policy', {
          name: `Immediate Payment ${marketplaceId}`,
          marketplaceId,
          categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
          immediatePay: true,
        });
        paymentPolicyId = createPRes.data?.paymentPolicyId || '';
      }
    } catch (err: any) {
      logger.warn(`Failed to resolve payment policy for ${marketplaceId}: ${err.message}`);
    }

    // 3. Return policy
    try {
      const rRes = await client.get(`/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`);
      const rList = rRes.data?.returnPolicies || [];
      if (rList.length > 0) {
        returnPolicyId = rList[0].returnPolicyId;
      } else {
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
    } catch (err: any) {
      logger.warn(`Failed to resolve return policy for ${marketplaceId}: ${err.message}`);
    }

    return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
  }

  /**
   * Create or update offer and publish to make the listing live on eBay
   */
  static async createOrUpdateAndPublishOffer(
    client: any,
    sku: string,
    params: {
      marketplaceId: string;
      currency: string;
      price: number;
      quantity: number;
      title: string;
      categoryId?: string;
      policies?: { fulfillmentPolicyId?: string; paymentPolicyId?: string; returnPolicyId?: string };
      merchantLocationKey?: string;
    }
  ): Promise<{ offerId?: string; listingId?: string; status: string; error?: string }> {
    const { marketplaceId, currency, price, quantity, categoryId, policies, merchantLocationKey } = params;

    let existingOfferId: string | undefined;
    let existingListingId: string | undefined;
    let existingStatus: string | undefined;

    try {
      const offRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
      const offers = offRes.data?.offers || [];
      const match = offers.find((o: any) => o.marketplaceId === marketplaceId) || offers[0];
      if (match) {
        existingOfferId = match.offerId;
        existingListingId = match.listing?.listingId;
        existingStatus = match.status;
      }
    } catch {
      // 404 is expected when no offer exists yet
    }

    const offerPayload: any = {
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
      } catch (putErr: any) {
        logger.warn(`Could not update existing offer ${existingOfferId}: ${putErr.message}`);
      }
    } else {
      try {
        const postRes = await client.post('/sell/inventory/v1/offer', offerPayload);
        offerId = postRes.data?.offerId;
      } catch (postErr: any) {
        const msg = postErr.response?.data?.errors?.[0]?.message || postErr.message;
        logger.error(`Could not create offer for SKU ${sku}: ${msg}`);
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
      logger.info(`Successfully published offer ${offerId} for SKU ${sku} on eBay! Listing ID: ${listingId}`);
      return { offerId, listingId, status: 'PUBLISHED' };
    } catch (pubErr: any) {
      const errMsg = pubErr.response?.data?.errors?.[0]?.message || pubErr.message;
      logger.warn(`Publish offer ${offerId} for SKU ${sku} returned: ${errMsg}`);
      return { offerId, listingId: existingListingId || offerId, status: 'PUBLISH_PENDING', error: errMsg };
    }
  }

  /**
   * Validate credentials live against eBay API
   */
  static async validateCredentials(host: string, token: string): Promise<boolean> {
    const client = this.getClient(host, token);
    try {
      const res = await client.get('/sell/inventory/v1/inventory_item?limit=1');
      return res.status >= 200 && res.status < 300;
    } catch (err: any) {
      const status = err.response?.status;

      if (status && status !== 401) {
        try {
          const fallbackRes = await client.get('/sell/account/v1/privilege');
          if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
            return true;
          }
        } catch {
          // fallback failed
        }
      }

      const errorMsg =
        err.response?.data?.errors?.[0]?.message ||
        err.response?.data?.errors?.[0]?.longMessage ||
        err.message;

      logger.warn(`eBay credential validation failed (${status}): ${errorMsg}`);
      const detailedError: any = new Error(
        `eBay Authentication Failed (${status || 'Connection Error'}): ${errorMsg}`
      );
      detailedError.status = status;
      throw detailedError;
    }
  }

  /**
   * Fetch a single inventory item with live offer pricing, listingId, and status from eBay
   */
  static async getInventoryItem(
    host: string,
    token: string,
    sku: string,
    connectionOrMarketplace?: any
  ): Promise<any | null> {
    const { locale, currency } = this.resolveMarketplace(connectionOrMarketplace);
    const client = this.getClient(host, token, locale);
    try {
      const res = await client.get(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
      const item = res.data;
      if (!item) return null;

      let price = 0;
      let itemCurrency = currency;
      let listingId = '';
      let offerStatus = 'UNPUBLISHED';
      let offerId = '';

      try {
        const offRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
        const offers = offRes.data?.offers || [];
        if (offers.length > 0) {
          const primaryOffer = offers.find((o: any) => o.status === 'PUBLISHED') || offers[0];
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
      } catch {
        // No offer found
      }

      const quantity =
        item.availability?.shipToLocationAvailability?.quantity ??
        item.availability?.shipToHomeQuantity ??
        0;

      return {
        sku: item.sku,
        title: item.product?.title || item.sku,
        description: item.product?.description || '',
        price,
        currency: itemCurrency,
        quantity,
        listingId,
        offerId,
        offerStatus,
        aspects: item.product?.aspects || {},
        images: item.product?.imageUrls || [],
        raw: item,
      };
    } catch (err: any) {
      logger.warn(`Failed to fetch eBay inventory item SKU ${sku}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch inventory items with live offer pricing, listingId, and status from eBay
   */
  static async getInventoryItems(
    host: string,
    token: string,
    limit = 100,
    connectionOrMarketplace?: any
  ): Promise<any[]> {
    const { locale, currency } = this.resolveMarketplace(connectionOrMarketplace);
    const client = this.getClient(host, token, locale);
    try {
      const res = await client.get(`/sell/inventory/v1/inventory_item?limit=${limit}`);
      const rawItems = res.data?.inventoryItems || [];
      const enrichedItems: any[] = [];

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
            const primaryOffer = offers.find((o: any) => o.status === 'PUBLISHED') || offers[0];
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
        } catch {
          // No offer found
        }

        const quantity =
          item.availability?.shipToLocationAvailability?.quantity ??
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
    } catch (err: any) {
      logger.warn(`Could not fetch eBay inventory items: ${err.message}`);
      return [];
    }
  }

  /**
   * Create or update an inventory item and published offer on eBay
   */
  static async setInventoryItem(
    host: string,
    token: string,
    sku: string,
    productData: {
      title: string;
      description?: string;
      quantity: number;
      price?: number;
      images?: string[];
      brand?: string;
      marketplaceId?: string;
      aspects?: Record<string, string[]>;
    }
  ): Promise<{ success: boolean; listingId?: string; offerId?: string; error?: string }> {
    const marketplace = productData.marketplaceId || (sku.includes('GB') || host.includes('uk') ? 'EBAY_GB' : 'EBAY_GB');
    const { locale, currency, marketplaceId } = this.resolveMarketplace(marketplace);
    const client = this.getClient(host, token, locale);

    try {
      const aspects = this.resolveAspects(productData.title, productData.brand, productData.aspects);
      const validImages = (productData.images || []).filter((url) => typeof url === 'string' && url.startsWith('http'));
      if (validImages.length === 0) {
        validImages.push('https://i.ebayimg.com/images/g/default/s-l1600.jpg');
      }

      const payload: any = {
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

      let listingId: string | undefined;
      let offerId: string | undefined;

      if (typeof productData.price === 'number' && productData.price > 0) {
        const merchantLocationKey = await this.ensureMerchantLocation(client, marketplaceId);
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
    } catch (err: any) {
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message;
      logger.error(`Failed to set eBay inventory item for SKU ${sku}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Delete an inventory item and associated offers from eBay
   */
  static async deleteInventoryItem(host: string, token: string, sku: string): Promise<boolean> {
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
      } catch { }

      const res = await client.delete(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
      logger.info(`Successfully deleted eBay inventory item for SKU ${sku} on ${host}`);
      return res.status === 204 || res.status === 200;
    } catch (err: any) {
      if (err.response?.status === 404) {
        logger.info(`eBay inventory item for SKU ${sku} was already deleted or not found on ${host}`);
        return true;
      }
      logger.error(`Failed to delete eBay inventory item for SKU ${sku} on ${host}: ${err.message}`);
      return false;
    }
  }

  /**
   * Automatically ingest and map an eBay item into the Master Catalog and Channel Products
   */
  static async ingestEbayProduct(params: {
    organizationId: any;
    connection: any;
    ebayItem: any;
  }): Promise<{ canonicalProductId: any; mappedCount: number }> {
    const { organizationId, connection, ebayItem } = params;
    const rawSku = (ebayItem.sku || '').trim();
    if (!rawSku) {
      return { canonicalProductId: null, mappedCount: 0 };
    }
    const cleanSku = rawSku.toUpperCase();
    const title = ebayItem.title || ebayItem.product?.title || rawSku;
    const description = ebayItem.description || ebayItem.product?.description || title;
    const price = typeof ebayItem.price === 'number' ? ebayItem.price : (parseFloat(ebayItem.price) || 0);
    const quantity = typeof ebayItem.quantity === 'number' ? ebayItem.quantity : (parseInt(ebayItem.quantity) || 0);
    const listingId = ebayItem.listingId || ebayItem.offerId || cleanSku;
    const offerId = ebayItem.offerId || '';
    const images = Array.isArray(ebayItem.images) && ebayItem.images.length > 0
      ? ebayItem.images
      : (ebayItem.product?.imageUrls || []);
    const brand = ebayItem.aspects?.Brand?.[0] || ebayItem.product?.aspects?.Brand?.[0] || 'Generic';
    const category = ebayItem.aspects?.Type?.[0] || ebayItem.product?.aspects?.Type?.[0] || 'General';

    // 1. Find or create ChannelProduct
    const channelProduct = await ChannelProduct.findOneAndUpdate(
      {
        organizationId,
        channelConnectionId: connection._id,
        $or: [
          { sku: cleanSku },
          { externalProductId: listingId },
        ],
      },
      {
        channelType: ChannelType.EBAY,
        externalProductId: listingId,
        externalVariantId: cleanSku,
        title,
        sku: cleanSku,
        barcode: '',
        price,
        inventoryQuantity: quantity,
        status: ChannelProductStatus.ACTIVE,
        syncStatus: SyncStatus.SYNCED,
        lastSyncedAt: new Date(),
        rawPayload: {
          ebayItem: ebayItem.raw || ebayItem,
          images,
          description,
          listingId,
          offerId,
        },
      },
      { upsert: true, new: true }
    );

    // 2. Find or match CanonicalProduct
    let canonicalProduct = await CanonicalProduct.findOne({
      organizationId,
      $or: [
        { masterSku: cleanSku },
        { title: { $regex: `^${title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ],
    });

    if (!canonicalProduct) {
      const existingVariant = await ProductVariant.findOne({
        organizationId,
        sku: cleanSku,
      });

      if (existingVariant) {
        canonicalProduct = await CanonicalProduct.findById(existingVariant.canonicalProductId);
      }
    }

    if (!canonicalProduct) {
      canonicalProduct = await CanonicalProduct.create({
        organizationId,
        title,
        masterSku: cleanSku,
        description,
        brand,
        category,
        tags: ['eBay'],
        images: images.map((url: string, idx: number) => ({
          url,
          altText: title,
          position: idx + 1,
          isPrimary: idx === 0,
        })),
        defaultCostPrice: 0,
        defaultRetailPrice: price,
        totalVariants: 1,
        status: ProductStatus.ACTIVE,
      });
    }

    // 3. Find or create ProductVariant
    let variant = await ProductVariant.findOne({
      organizationId,
      canonicalProductId: canonicalProduct._id,
      sku: cleanSku,
    });

    if (!variant) {
      variant = await ProductVariant.create({
        organizationId,
        canonicalProductId: canonicalProduct._id,
        sku: cleanSku,
        title,
        costPrice: 0,
        retailPrice: price,
      });
    } else {
      if (price > 0 && (!variant.retailPrice || variant.retailPrice === 0)) {
        variant.retailPrice = price;
        await variant.save();
      }
    }

    // 4. Ensure InventoryItem exists
    let invItem = await InventoryItem.findOne({
      organizationId,
      canonicalVariantId: variant._id,
    });

    if (!invItem) {
      invItem = await InventoryItem.create({
        organizationId,
        canonicalVariantId: variant._id,
        sku: cleanSku,
        trackedStock: Math.max(0, quantity),
        reservedStock: 0,
        safetyStock: 0,
        availableToAllocate: Math.max(0, quantity),
        lowStockThreshold: 5,
      });
    }

    // 5. Establish strict ProductMapping
    await ProductMapping.findOneAndUpdate(
      {
        organizationId,
        canonicalVariantId: variant._id,
        channelConnectionId: connection._id,
      },
      {
        $set: {
          canonicalProductId: canonicalProduct._id,
          canonicalVariantId: variant._id,
          channelConnectionId: connection._id,
          channelProductId: channelProduct._id,
          channelType: ChannelType.EBAY,
          mappingConfidence: MappingConfidence.EXACT_SKU,
          syncPrice: true,
          syncInventory: true,
          status: MappingStatus.MAPPED,
          updatedAt: new Date(),
        },
        $unset: {
          unmappedAt: 1,
          unmappedReason: 1,
        },
      },
      { upsert: true, new: true }
    );

    return {
      canonicalProductId: canonicalProduct._id,
      mappedCount: 1,
    };
  }

  /**
   * Bulk import / sync all inventory items from an eBay store connection
   */
  static async syncAllEbayProducts(
    connection: any,
    organizationId: any
  ): Promise<{ totalItems: number; syncedCount: number }> {
    const { host, token } = await this.getValidCredentials(connection);
    const items = await this.getInventoryItems(host, token, 100, connection);
    let syncedCount = 0;

    for (const item of items) {
      if (!item.sku) continue;
      try {
        const { mappedCount } = await this.ingestEbayProduct({
          organizationId,
          connection,
          ebayItem: item,
        });
        syncedCount += mappedCount;
      } catch (err: any) {
        logger.warn(`Failed to ingest eBay item SKU ${item.sku}: ${err.message}`);
      }
    }

    connection.lastSyncAt = new Date();
    await connection.save();

    return { totalItems: items.length, syncedCount };
  }

}
