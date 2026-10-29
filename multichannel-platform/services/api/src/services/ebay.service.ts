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
import { EbayIngestionService } from './ebay-ingestion.service';

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
   * Resolve an eBay category ID based on product category or title keywords
   */
  /**
   * Resolve an eBay leaf category ID based on product category or title keywords.
   * eBay strictly requires a LEAF category ID (lowest child node); parent nodes cause Error 25005.
   */
  static resolveCategoryId(categoryNameOrTitle?: string): string {
    const text = (categoryNameOrTitle || '').toLowerCase().trim();
    if (!text) return '112529'; // Safe leaf category default (Headphones / Electronics)

    // Direct numeric category ID passed
    if (/^\d{3,10}$/.test(text)) {
      return text;
    }

    // Audio, Headphones & Earphones (Leaf: 112529)
    if (text.includes('headphone') || text.includes('earphone') || text.includes('audio') || text.includes('speaker') || text.includes('sound')) {
      return '112529'; // Consumer Electronics > Portable Audio & Headphones > Headphones (Leaf Category)
    }

    // Tableware, Drinkware, Mugs, Cups, Glasses (Leaf: 261672)
    if (
      text.includes('cup') ||
      text.includes('mug') ||
      text.includes('tea') ||
      text.includes('coffee') ||
      text.includes('glass') ||
      text.includes('bottle') ||
      text.includes('drinkware') ||
      text.includes('tableware')
    ) {
      return '261672'; // Home, Furniture & DIY > Tableware & Serving > Mugs (Leaf Category on eBay US & GB)
    }

    // Ink & Toner Cartridges (Leaf: 168061)
    if (text.includes('ink') || text.includes('toner') || text.includes('cartridge')) {
      return '168061'; // Computers/Tablets & Networking > Printers, Scanners & Supplies > Ink Cartridges (Leaf Category)
    }

    // Watches (Leaf: 31387)
    if (text.includes('watch') || text.includes('fitness') || text.includes('tracker')) {
      return '31387'; // Jewellery & Watches > Watches > Wristwatches (Leaf Category)
    }

    // Apparel & Clothing (Leaf: 15687)
    if (
      text.includes('shirt') ||
      text.includes('t-shirt') ||
      text.includes('tee') ||
      text.includes('hoodie') ||
      text.includes('jacket') ||
      text.includes('apparel') ||
      text.includes('clothing')
    ) {
      return '15687'; // Men's Clothing > T-Shirts (Leaf Category)
    }

    // Kitchenware & Dining (Leaf: 20635)
    if (
      text.includes('kitchen') ||
      text.includes('cook') ||
      text.includes('pan') ||
      text.includes('pot') ||
      text.includes('knife') ||
      text.includes('plate') ||
      text.includes('bowl')
    ) {
      return '20635'; // Cookware, Dining & Bar > Cookware (Leaf Category)
    }

    // Snowboarding & Sports (Leaf: 21248)
    if (text.includes('snowboard') || text.includes('ski') || text.includes('sport')) {
      return '21248'; // Snowboarding (Leaf Category)
    }

    // Phones & Accessories (Leaf: 9355)
    if (text.includes('phone') || text.includes('mobile') || text.includes('case')) {
      return '9355'; // Cell Phones & Smartphones (Leaf Category)
    }

    // Computers & Laptops (Leaf: 177)
    if (text.includes('laptop') || text.includes('computer') || text.includes('pc') || text.includes('macbook')) {
      return '177'; // Laptops & Netbooks (Leaf Category)
    }

    // Books (Leaf: 377)
    if (text.includes('book') || text.includes('novel')) {
      return '377'; // Books > Fiction & Literature (Leaf Category)
    }

    // Pens & Writing (Leaf: 967)
    if (text.includes('pen') || text.includes('stationery') || text.includes('notebook') || text.includes('pencil')) {
      return '967'; // Collectibles > Pens & Writing Instruments (Leaf Category)
    }

    return '112529'; // Default universal leaf category (Consumer Electronics / Headphones)
  }

  /**
   * Dynamically query eBay Taxonomy API for real-time suggested leaf category
   */
  static async suggestLeafCategory(client: any, query: string, marketplaceId = 'EBAY_GB'): Promise<string | null> {
    try {
      const treeId = marketplaceId === 'EBAY_GB' ? '3' : '0';
      const res = await client.get(`/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(query)}`);
      const suggestions = res.data?.categorySuggestions || [];
      if (suggestions.length > 0 && suggestions[0].category?.categoryId) {
        const catId = String(suggestions[0].category.categoryId);
        logger.info(`[eBay Taxonomy] Real-time suggested leaf category for "${query}": ${catId} (${suggestions[0].category?.categoryName || 'Unknown'})`);
        return catId;
      }
    } catch (e: any) {
      logger.debug(`[eBay Taxonomy] Dynamic category suggestion skipped: ${e.message}`);
    }
    return null;
  }

  /**
   * Format detailed eBay error messages from API response
   */
  static formatEbayError(err: any): string {
    const data = err.response?.data;
    if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      return data.errors
        .map((e: any) => {
          const params = Array.isArray(e.parameters) && e.parameters.length > 0
            ? ` (${e.parameters.map((p: any) => `${p.name}=${p.value}`).join(', ')})`
            : '';
          return `[eBay Error ${e.errorId || 'N/A'}] ${e.longMessage || e.message}${params}`;
        })
        .join(' | ');
    }
    return data?.message || data?.error_description || err.message;
  }

  /**
   * Ensure standard category-specific aspects are provided
   */
  static resolveAspects(
    title: string,
    brand?: string,
    customAspects?: Record<string, string[]>,
    category?: string
  ): Record<string, string[]> {
    const rawAspects: Record<string, any> = { ...(customAspects || {}) };
    const aspects: Record<string, string[]> = {};

    for (const [key, val] of Object.entries(rawAspects)) {
      if (Array.isArray(val)) {
        aspects[key] = val.map(String).filter(Boolean);
      } else if (val !== undefined && val !== null) {
        aspects[key] = [String(val)];
      }
    }

    const effectiveBrand = brand && brand !== 'Generic' ? brand : 'Unbranded';
    if (!aspects['Brand'] || aspects['Brand'].length === 0) {
      aspects['Brand'] = [effectiveBrand];
    }
    if (!aspects['Type'] || aspects['Type'].length === 0) {
      aspects['Type'] = ['Original'];
    }

    const t = (title + ' ' + (brand || '') + ' ' + (category || '')).toLowerCase();
    const isHeadphones = t.includes('headphone') || t.includes('earphone') || t.includes('audio');
    const isWatch = t.includes('watch') || t.includes('fitness');
    const isStationery = t.includes('pen') || t.includes('stationery') || t.includes('notebook');
    const isInk = t.includes('ink') || t.includes('toner') || t.includes('cartridge');
    const isCup = t.includes('cup') || t.includes('mug') || t.includes('tea') || t.includes('coffee') || t.includes('drinkware') || t.includes('tableware');

    if (isCup) {
      if (!aspects['Type'] || aspects['Type'][0] === 'Original') {
        aspects['Type'] = [t.includes('tea') ? 'Tea Cup' : (t.includes('coffee') ? 'Coffee Cup' : 'Mug')];
      }
      if (!aspects['Material']) {
        aspects['Material'] = ['Ceramic'];
      }
    }

    if (isInk) {
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
      if (!aspects['Type'] || aspects['Type'][0] === 'Original') {
        aspects['Type'] = [t.includes('earbud') || t.includes('in-ear') ? 'Earbud (In Ear)' : 'Ear-Cup (Over the Ear)'];
      }
      if (!aspects['Connectivity']) aspects['Connectivity'] = ['Bluetooth', 'Wireless'];
      if (!aspects['Model']) aspects['Model'] = ['Universal'];
    }

    const isPhone = t.includes('phone') || t.includes('mobile') || t.includes('smartphone') || t.includes('cell') || t.includes('galaxy') || t.includes('iphone');
    if (isPhone) {
      if (!aspects['Form Factor']) aspects['Form Factor'] = ['Bar'];
      if (!aspects['Storage Capacity']) aspects['Storage Capacity'] = ['128 GB'];
      if (!aspects['Model']) {
        const phoneModel = t.includes('galaxy') ? 'Samsung Galaxy' : (t.includes('iphone') ? 'Apple iPhone' : 'Smartphone');
        aspects['Model'] = [phoneModel];
      }
      if (!aspects['Network']) aspects['Network'] = ['Unlocked'];
      if (!aspects['Operating System']) aspects['Operating System'] = [t.includes('iphone') || t.includes('apple') ? 'iOS' : 'Android'];
      if (!aspects['Lock Status']) aspects['Lock Status'] = ['Factory Unlocked'];
    }

    const isLaptop = t.includes('laptop') || t.includes('computer') || t.includes('pc') || t.includes('macbook') || (t.includes('notebook') && !t.includes('paper'));
    if (isLaptop) {
      if (!aspects['Screen Size']) aspects['Screen Size'] = ['15.6 in'];
      if (!aspects['Processor']) aspects['Processor'] = ['Intel Core i5'];
      if (!aspects['RAM Size']) aspects['RAM Size'] = ['8 GB'];
      if (!aspects['SSD Capacity']) aspects['SSD Capacity'] = ['256 GB'];
      if (!aspects['Operating System']) aspects['Operating System'] = [t.includes('mac') ? 'macOS' : 'Windows 11'];
    }

    if (isWatch) {
      if (!aspects['Case Size']) aspects['Case Size'] = ['40 mm'];
      if (!aspects['Band Material']) aspects['Band Material'] = ['Silicone'];
      if (!aspects['Compatible Operating System']) aspects['Compatible Operating System'] = ['iOS - Apple', 'Android'];
      if (!aspects['Department']) aspects['Department'] = ['Unisex Adults'];
    }

    const isApparel = t.includes('shirt') || t.includes('t-shirt') || t.includes('tee') || t.includes('hoodie') || t.includes('jacket') || t.includes('clothing') || t.includes('apparel');
    if (isApparel) {
      if (!aspects['Size Type']) aspects['Size Type'] = ['Regular'];
      if (!aspects['Size']) aspects['Size'] = ['L'];
      if (!aspects['Department']) aspects['Department'] = ['Men'];
      if (!aspects['Colour']) aspects['Colour'] = ['Black'];
    }
    return aspects;
  }

  /**
   * Fetch required aspects for category from eBay Taxonomy API and populate any missing required fields
   */
  static async enrichRequiredAspects(
    client: any,
    categoryId: string,
    marketplaceId: string,
    aspects: Record<string, string[]>,
    title: string,
    brand?: string
  ): Promise<Record<string, string[]>> {
    const treeId = marketplaceId === 'EBAY_GB' ? '3' : '0';
    try {
      const res = await client.get(`/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`);
      const categoryAspects = res.data?.aspects || [];
      for (const asp of categoryAspects) {
        const name = asp.localizedAspectName;
        const isRequired = asp.aspectConstraint?.aspectRequired === true;
        if (isRequired && (!aspects[name] || aspects[name].length === 0)) {
          const allowedValues = asp.aspectValues || [];
          let defaultVal = allowedValues.length > 0 ? allowedValues[0].localizedValue : 'Standard';

          const lowerName = name.toLowerCase();
          if (lowerName === 'form factor') defaultVal = 'Bar';
          else if (lowerName === 'brand') defaultVal = (brand && brand !== 'Generic') ? brand : 'Unbranded';
          else if (lowerName === 'storage capacity') defaultVal = '128 GB';
          else if (lowerName === 'model') defaultVal = 'Universal';
          else if (lowerName === 'network') defaultVal = 'Unlocked';
          else if (lowerName === 'connectivity') defaultVal = 'Bluetooth';
          else if (lowerName === 'type') defaultVal = 'Standard';

          aspects[name] = [defaultVal];
          logger.info(`[eBay Aspect Enrichment] Injected required aspect "${name}": ["${defaultVal}"] for category ${categoryId}`);
        }
      }
    } catch (e: any) {
      logger.debug(`[eBay Aspect Enrichment] Skipping taxonomy dynamic aspects: ${e.message}`);
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
      const fRes = await client.get(`/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}&limit=50`);
      const fList = fRes.data?.fulfillmentPolicies || [];
      if (fList.length > 0) {
        fulfillmentPolicyId = fList[0].fulfillmentPolicyId;
      } else {
        try {
          const createFRes = await client.post('/sell/account/v1/fulfillment_policy', {
            name: `Standard Free Shipping ${isGB ? 'UK' : 'US'} ${Date.now()}`,
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
        } catch (createErr: any) {
          // Re-fetch in case policy with similar config exists
          const retryRes = await client.get(`/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}&limit=50`).catch(() => null);
          fulfillmentPolicyId = retryRes?.data?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId || '';
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to resolve fulfillment policy for ${marketplaceId}: ${err.message}`);
    }

    // 2. Payment policy
    try {
      const pRes = await client.get(`/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}&limit=50`);
      const pList = pRes.data?.paymentPolicies || [];
      if (pList.length > 0) {
        paymentPolicyId = pList[0].paymentPolicyId;
      } else {
        try {
          const createPRes = await client.post('/sell/account/v1/payment_policy', {
            name: `Immediate Payment ${marketplaceId} ${Date.now()}`,
            marketplaceId,
            categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES', default: true }],
            immediatePay: true,
          });
          paymentPolicyId = createPRes.data?.paymentPolicyId || '';
        } catch {
          const retryRes = await client.get(`/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}&limit=50`).catch(() => null);
          paymentPolicyId = retryRes?.data?.paymentPolicies?.[0]?.paymentPolicyId || '';
        }
      }
    } catch (err: any) {
      logger.warn(`Failed to resolve payment policy for ${marketplaceId}: ${err.message}`);
    }

    // 3. Return policy
    try {
      const rRes = await client.get(`/sell/account/v1/return_policy?marketplace_id=${marketplaceId}&limit=50`);
      const rList = rRes.data?.returnPolicies || [];
      if (rList.length > 0) {
        returnPolicyId = rList[0].returnPolicyId;
      } else {
        try {
          const createRRes = await client.post('/sell/account/v1/return_policy', {
            name: `Standard 30 Day Returns ${marketplaceId} ${Date.now()}`,
            marketplaceId,
            categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
            returnsAccepted: true,
            returnPeriod: { value: 30, unit: 'DAY' },
            returnShippingCostPayer: 'BUYER',
          });
          returnPolicyId = createRRes.data?.returnPolicyId || '';
        } catch {
          const retryRes = await client.get(`/sell/account/v1/return_policy?marketplace_id=${marketplaceId}&limit=50`).catch(() => null);
          returnPolicyId = retryRes?.data?.returnPolicies?.[0]?.returnPolicyId || '';
        }
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

    if (!policies?.fulfillmentPolicyId || !policies?.paymentPolicyId || !policies?.returnPolicyId) {
      const missing: string[] = [];
      if (!policies?.fulfillmentPolicyId) missing.push('fulfillment policy');
      if (!policies?.paymentPolicyId) missing.push('payment policy');
      if (!policies?.returnPolicyId) missing.push('return policy');
      const policyMsg = `Missing required listing policies (${missing.join(', ')}) for ${marketplaceId}. Please ensure business policies are configured in your eBay account.`;
      logger.error(`[eBay Offer] SKU ${sku}: ${policyMsg}`);
      return { status: 'FAILED_POLICIES', error: policyMsg };
    }

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
      merchantLocationKey: merchantLocationKey || (marketplaceId === 'EBAY_GB' ? 'uk-warehouse-1' : 'us-warehouse-1'),
      listingPolicies: {
        fulfillmentPolicyId: policies.fulfillmentPolicyId,
        paymentPolicyId: policies.paymentPolicyId,
        returnPolicyId: policies.returnPolicyId,
      },
    };

    let offerId = existingOfferId;
    if (existingOfferId) {
      try {
        await client.put(`/sell/inventory/v1/offer/${existingOfferId}`, offerPayload);
      } catch (putErr: any) {
        const putErrMsg = this.formatEbayError(putErr);
        logger.warn(`Could not update existing offer ${existingOfferId} for SKU ${sku}: ${putErrMsg}`);
        try {
          const postRes = await client.post('/sell/inventory/v1/offer', offerPayload);
          if (postRes.data?.offerId) {
            offerId = postRes.data.offerId;
          }
        } catch (postErr: any) {
          return { status: 'FAILED_OFFER_CREATE', error: putErrMsg };
        }
      }
    } else {
      try {
        const postRes = await client.post('/sell/inventory/v1/offer', offerPayload);
        offerId = postRes.data?.offerId;
      } catch (postErr: any) {
        const msg = this.formatEbayError(postErr);
        logger.error(`[eBay Offer Creation Rejection] Could not create offer for SKU ${sku}: ${msg}`, {
          payload: offerPayload,
          response: postErr.response?.data,
        });
        return { status: 'FAILED_OFFER_CREATE', error: msg };
      }
    }

    if (!offerId) {
      return { status: 'NO_OFFER_ID', error: 'eBay did not return a valid offerId' };
    }

    // If already published and active on eBay, the PUT update was enough
    if (existingStatus === 'PUBLISHED' && existingListingId) {
      return { offerId, listingId: existingListingId, status: 'PUBLISHED' };
    }

    // Publish offer to make listing live on eBay
    try {
      const pubRes = await client.post(`/sell/inventory/v1/offer/${offerId}/publish`);
      const listingId = pubRes.data?.listingId || existingListingId;
      if (!listingId) {
        const noIdMsg = `Publish call succeeded for offer ${offerId} but eBay returned no listingId / ItemID`;
        logger.error(`[eBay Publish Rejection] ${noIdMsg}`);
        return { offerId, status: 'NO_LISTING_ID', error: noIdMsg };
      }
      logger.info(`Successfully published offer ${offerId} for SKU ${sku} on eBay! Listing ID: ${listingId}`);
      return { offerId, listingId, status: 'PUBLISHED' };
    } catch (pubErr: any) {
      const errMsg = this.formatEbayError(pubErr);
      logger.error(`[eBay Publish Rejection] Publish offer ${offerId} for SKU ${sku} failed: ${errMsg}`, {
        offerId,
        sku,
        response: pubErr.response?.data,
      });
      return { offerId, status: 'FAILED_PUBLISH', error: errMsg };
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
    const itemsMap = new Map<string, any>();

    try {
      // 1. Fetch inventory items
      try {
        const res = await client.get(`/sell/inventory/v1/inventory_item?limit=${limit}`);
        const rawItems = res.data?.inventoryItems || [];
        for (const item of rawItems) {
          const sku = (item.sku || '').trim();
          if (!sku) continue;
          const quantity =
            item.availability?.shipToLocationAvailability?.quantity ??
            item.availability?.shipToHomeQuantity ??
            0;
          itemsMap.set(sku.toUpperCase(), {
            sku,
            title: item.product?.title || sku,
            description: item.product?.description || '',
            price: 0,
            currency,
            listingId: '',
            offerId: '',
            offerStatus: 'UNPUBLISHED',
            isPublished: false,
            quantity,
            images: item.product?.imageUrls || [],
            aspects: item.product?.aspects || {},
            raw: item,
          });
        }
      } catch (invErr: any) {
        logger.warn(`Could not fetch eBay inventory items: ${invErr.message}`);
      }

      // 2. Fetch offers to discover published listings and enrich items
      try {
        const offRes = await client.get(`/sell/inventory/v1/offer?limit=${limit}`);
        const offers = offRes.data?.offers || [];
        for (const off of offers) {
          const offSku = (off.sku || '').trim().toUpperCase();
          const listingId = off.listing?.listingId || '';
          const offerPrice = off.pricingSummary?.price?.value ? parseFloat(off.pricingSummary.price.value) : 0;
          const offerCurrency = off.pricingSummary?.price?.currency || currency;
          const isPublished = off.status === 'PUBLISHED';

          if (offSku && itemsMap.has(offSku)) {
            const existing = itemsMap.get(offSku)!;
            existing.offerId = off.offerId;
            existing.offerStatus = off.status;
            existing.isPublished = isPublished;
            if (listingId) existing.listingId = listingId;
            if (offerPrice > 0) {
              existing.price = offerPrice;
              existing.currency = offerCurrency;
            }
          } else if (offSku) {
            itemsMap.set(offSku, {
              sku: off.sku,
              title: off.sku,
              description: '',
              price: offerPrice,
              currency: offerCurrency,
              listingId,
              offerId: off.offerId,
              offerStatus: off.status,
              isPublished,
              quantity: off.availableQuantity || 0,
              images: [],
              aspects: {},
              raw: off,
            });
          }
        }
      } catch (offErr: any) {
        logger.warn(`Could not list eBay offers during getInventoryItems: ${offErr.message}`);
      }

      // 3. For any items without offer info yet, query individual offer
      for (const item of itemsMap.values()) {
        if (!item.offerId && item.sku) {
          try {
            const singleOffRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(item.sku)}`);
            const singleOffers = singleOffRes.data?.offers || [];
            if (singleOffers.length > 0) {
              const primary = singleOffers.find((o: any) => o.status === 'PUBLISHED') || singleOffers[0];
              item.offerId = primary.offerId;
              item.offerStatus = primary.status;
              item.listingId = primary.listing?.listingId || '';
              item.isPublished = primary.status === 'PUBLISHED';
              if (primary.pricingSummary?.price?.value) {
                item.price = parseFloat(primary.pricingSummary.price.value);
              }
            }
          } catch {
            // 404 is expected for items without offer
          }
        }
      }

      return Array.from(itemsMap.values());
    } catch (err: any) {
      logger.warn(`Could not fetch eBay inventory items: ${err.message}`);
      return Array.from(itemsMap.values());
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
      category?: string;
      categoryId?: string;
      marketplaceId?: string;
      aspects?: Record<string, string[]>;
    }
  ): Promise<{ success: boolean; listingId?: string; offerId?: string; error?: string }> {
    const marketplace = productData.marketplaceId || (sku.includes('GB') || host.includes('uk') ? 'EBAY_GB' : 'EBAY_US');
    const { locale, currency, marketplaceId } = this.resolveMarketplace(marketplace);
    const client = this.getClient(host, token, locale);

    try {
      if (typeof productData.price !== 'number' || isNaN(productData.price) || productData.price <= 0) {
        const priceErr = `Invalid price for SKU ${sku}: price must be a positive number to list on eBay`;
        logger.error(`[eBay Schema Validation] ${priceErr}`);
        return { success: false, error: priceErr };
      }

      const cleanTitle = (productData.title || sku).trim().slice(0, 80);
      const cleanDescription = (productData.description || cleanTitle).trim();

      let resolvedCategoryId = productData.categoryId;
      if (!resolvedCategoryId) {
        resolvedCategoryId = await this.suggestLeafCategory(client, productData.category || cleanTitle, marketplaceId);
      }
      if (!resolvedCategoryId) {
        resolvedCategoryId = this.resolveCategoryId(productData.category || cleanTitle);
      }

      let aspects = this.resolveAspects(cleanTitle, productData.brand, productData.aspects, productData.category);
      aspects = await this.enrichRequiredAspects(client, resolvedCategoryId, marketplaceId, aspects, cleanTitle, productData.brand);

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
          title: cleanTitle,
          description: cleanDescription,
          imageUrls: validImages,
          aspects,
        },
      };

      try {
        const invRes = await client.put(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, payload);
        if (invRes.status !== 204 && invRes.status !== 200) {
          const errMsg = `Failed to set inventory item (${invRes.status})`;
          logger.error(`[eBay Inventory Rejection] SKU ${sku}: ${errMsg}`);
          return { success: false, error: errMsg };
        }
      } catch (invErr: any) {
        const errMsg = this.formatEbayError(invErr);
        logger.error(`[eBay Inventory Rejection] Failed to set inventory item for SKU ${sku}: ${errMsg}`, {
          payload,
          status: invErr.response?.status,
        });
        return { success: false, error: errMsg };
      }

      const merchantLocationKey = await this.ensureMerchantLocation(client, marketplaceId);
      const policies = await this.ensureListingPolicies(client, marketplaceId);

      const offerResult = await this.createOrUpdateAndPublishOffer(client, sku, {
        marketplaceId,
        currency,
        price: productData.price,
        quantity: productData.quantity,
        title: cleanTitle,
        categoryId: resolvedCategoryId,
        policies,
        merchantLocationKey,
      });

      if (offerResult.status !== 'PUBLISHED' || !offerResult.listingId) {
        const failureReason =
          offerResult.error ||
          `Offer ${offerResult.offerId || 'unknown'} could not be published to eBay (no confirmed ItemID returned)`;
        logger.error(`[eBay Listing Rejection] Listing creation for SKU ${sku} rejected: ${failureReason}`);
        return {
          success: false,
          error: failureReason,
          offerId: offerResult.offerId,
          listingId: offerResult.listingId,
        };
      }

      logger.info(`[eBay Publish Success] SKU ${sku} is live on eBay! ItemID: ${offerResult.listingId}`);
      return { success: true, listingId: offerResult.listingId, offerId: offerResult.offerId };
    } catch (err: any) {
      const errMsg = this.formatEbayError(err);
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
   * (Delegates to dedicated EbayIngestionService)
   */
  static async ingestEbayProduct(params: {
    organizationId: any;
    connection: any;
    ebayItem: any;
  }): Promise<{ canonicalProductId: any; mappedCount: number }> {
    const result = await EbayIngestionService.ingestItem(params);
    return {
      canonicalProductId: result.canonicalProductId,
      mappedCount: result.mappingId ? 1 : 0,
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
      try {
        const { mappedCount } = await this.ingestEbayProduct({
          organizationId,
          connection,
          ebayItem: item,
        });
        syncedCount += mappedCount;
      } catch (err: any) {
        logger.warn(`Failed to ingest eBay item SKU ${item.sku || 'N/A'}: ${err.message}`);
      }
    }

    connection.lastSyncAt = new Date();
    await connection.save();

    return { totalItems: items.length, syncedCount };
  }

  /**
   * Status check and bidirectional reconciliation utility:
   * 1. Verifies that mapped items in the platform actually exist on eBay.
   * 2. Resolves discrepancies automatically (marks unmapped if deleted/ended on eBay, updates live status).
   * 3. Discovers unmapped eBay items and safely ingests them into the platform catalog.
   */
  static async reconcileEbaySync(
    organizationId: any,
    connection: any
  ): Promise<{
    totalChecked: number;
    verifiedCount: number;
    discrepanciesResolvedCount: number;
    missingOnEbayCount: number;
    newlyIngestedCount: number;
    details: Array<{ sku: string; status: string; reason?: string }>;
  }> {
    const details: Array<{ sku: string; status: string; reason?: string }> = [];
    let verifiedCount = 0;
    let discrepanciesResolvedCount = 0;
    let missingOnEbayCount = 0;
    let newlyIngestedCount = 0;

    const { host, token } = await this.getValidCredentials(connection);
    const { locale } = this.resolveMarketplace(connection);
    const client = this.getClient(host, token, locale);

    // Fetch all active mappings for this connection
    const mappings = await ProductMapping.find({
      organizationId,
      channelConnectionId: connection._id,
      status: MappingStatus.MAPPED,
    }).populate('channelProductId');

    // 1. Check each mapped item against live eBay API
    for (const mapping of mappings) {
      const chProd: any = mapping.channelProductId;
      const sku = (chProd?.sku || '').trim();
      if (!sku) continue;

      try {
        const itemRes = await client.get(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
        const ebayItem = itemRes.data;

        // Check live offer status
        let isLiveListing = false;
        let confirmedListingId = chProd.externalProductId || chProd.externalListingId;
        try {
          const offRes = await client.get(`/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
          const offers = offRes.data?.offers || [];
          const liveOffer = offers.find((o: any) => o.status === 'PUBLISHED');
          if (liveOffer) {
            isLiveListing = true;
            if (liveOffer.listing?.listingId) {
              confirmedListingId = liveOffer.listing.listingId;
            }
          }
        } catch {
          // No offer found
        }

        if (isLiveListing) {
          verifiedCount++;
          if (
            chProd.status !== ChannelProductStatus.ACTIVE ||
            chProd.syncStatus !== SyncStatus.SYNCED ||
            chProd.externalProductId !== confirmedListingId
          ) {
            chProd.status = ChannelProductStatus.ACTIVE;
            chProd.syncStatus = SyncStatus.SYNCED;
            chProd.externalProductId = confirmedListingId;
            chProd.externalListingId = confirmedListingId;
            chProd.lastSyncedAt = new Date();
            await chProd.save();
          }
          details.push({ sku, status: 'VERIFIED_ACTIVE', reason: `Item live on eBay (Listing ID: ${confirmedListingId})` });
        } else {
          chProd.status = ChannelProductStatus.UNPUBLISHED;
          chProd.syncStatus = SyncStatus.OUT_OF_SYNC;
          await chProd.save();
          discrepanciesResolvedCount++;
          details.push({ sku, status: 'UNPUBLISHED_ON_EBAY', reason: 'Inventory item exists but offer is not published' });
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          // Discrepancy: Item mapped in platform but deleted/missing on eBay
          missingOnEbayCount++;
          discrepanciesResolvedCount++;

          chProd.status = ChannelProductStatus.ENDED;
          chProd.syncStatus = SyncStatus.FAILED;
          chProd.rawPayload = { ...(chProd.rawPayload || {}), reconciliationError: 'Item not found on eBay (404)' };
          await chProd.save();

          mapping.status = MappingStatus.UNMAPPED;
          mapping.unmappedAt = new Date();
          mapping.unmappedReason = 'Item does not exist on eBay (verified via reconciliation check)';
          await mapping.save();

          logger.warn(`[eBay Reconciliation] Discrepancy resolved: SKU ${sku} marked unmapped because it does not exist on eBay`);
          details.push({ sku, status: 'RESOLVED_NOT_ON_EBAY', reason: 'Item not found on eBay; unmapped' });
        } else {
          details.push({ sku, status: 'CHECK_ERROR', reason: err.message });
        }
      }
    }

    // 2. Discover unmapped items on eBay and ingest them
    try {
      const ebayItems = await this.getInventoryItems(host, token, 100, connection);
      for (const item of ebayItems) {
        if (!item.sku) continue;
        const cleanSku = item.sku.toUpperCase().trim();

        const alreadyMapped = await ProductMapping.findOne({
          organizationId,
          channelConnectionId: connection._id,
          status: MappingStatus.MAPPED,
        }).populate({
          path: 'channelProductId',
          match: { sku: cleanSku },
        });

        if (!alreadyMapped || !alreadyMapped.channelProductId) {
          const { isNewProduct } = await EbayIngestionService.ingestItem({
            organizationId,
            connection,
            ebayItem: item,
          });
          newlyIngestedCount++;
          details.push({
            sku: cleanSku,
            status: 'INGESTED',
            reason: isNewProduct ? 'New product created in catalog' : 'Matched and mapped to catalog product',
          });
        }
      }
    } catch (ingestErr: any) {
      logger.warn(`[eBay Reconciliation] Error during unmapped items discovery: ${ingestErr.message}`);
    }

    connection.lastSyncAt = new Date();
    await connection.save();

    logger.info(
      `[eBay Reconciliation] Finished for ${connection.name}: Checked ${mappings.length}, Verified ${verifiedCount}, Resolved ${discrepanciesResolvedCount}, Newly Ingested ${newlyIngestedCount}`
    );

    return {
      totalChecked: mappings.length,
      verifiedCount,
      discrepanciesResolvedCount,
      missingOnEbayCount,
      newlyIngestedCount,
      details,
    };
  }

}
