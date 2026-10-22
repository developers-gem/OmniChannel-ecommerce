import axios from 'axios';
import { decryptSecret, encryptSecret } from '../utils/crypto';
import { logger } from '../utils/logger';
import { config } from '../config';
import { ChannelConnection } from '../database/models';
import { ChannelStatus } from '@multichannel/shared';

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
   * Get an authorized axios instance for eBay REST APIs
   */
  static getClient(host: string, token: string) {
    return axios.create({
      baseURL: `https://${host}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Language': 'en-US',
        'Content-Language': 'en-US',
      },
      timeout: 20000,
    });
  }

  /**
   * Validate credentials live against eBay API
   */
  static async validateCredentials(host: string, token: string): Promise<boolean> {
    const client = this.getClient(host, token);
    try {
      // Test request to eBay Inventory API endpoint
      const res = await client.get('/sell/inventory/v1/inventory_item?limit=1');
      return res.status >= 200 && res.status < 300;
    } catch (err: any) {
      const status = err.response?.status;

      // If not an unauthorized 401, check if the account endpoint responds (e.g. fresh sandbox user with no inventory yet)
      if (status && status !== 401) {
        try {
          const fallbackRes = await client.get('/sell/account/v1/privilege');
          if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
            return true;
          }
        } catch {
          // If fallback fails as well, throw the primary error below
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
   * Fetch active inventory items from eBay
   */
  static async getInventoryItems(host: string, token: string, limit = 100): Promise<any[]> {
    const client = this.getClient(host, token);
    try {
      const res = await client.get(`/sell/inventory/v1/inventory_item?limit=${limit}`);
      const rawItems = res.data?.inventoryItems || [];
      return rawItems.map((item: any) => ({
        sku: item.sku,
        title: item.product?.title || item.sku,
        description: item.product?.description || '',
        price: item.offers?.[0]?.pricingSummary?.price?.value
          ? parseFloat(item.offers[0].pricingSummary.price.value)
          : 0,
        quantity:
          item.availability?.shipToLocationAvailability?.quantity ??
          item.availability?.shipToHomeQuantity ??
          0,
        images: item.product?.imageUrls || [],
        raw: item,
      }));
    } catch (err: any) {
      logger.warn(`Could not fetch eBay inventory items: ${err.message}`);
      return [];
    }
  }

  /**
   * Create or update an inventory item on eBay
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
    }
  ): Promise<boolean> {
    const client = this.getClient(host, token);
    try {
      const payload: any = {
        availability: {
          shipToLocationAvailability: {
            quantity: Math.max(0, productData.quantity),
          },
        },
        condition: 'NEW',
        product: {
          title: productData.title.slice(0, 80),
          description: productData.description || productData.title,
          imageUrls: productData.images || [],
        },
      };

      const res = await client.put(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, payload);
      return res.status === 204 || res.status === 200;
    } catch (err: any) {
      logger.error(`Failed to set eBay inventory item for SKU ${sku}: ${err.message}`);
      return false;
    }
  }

  /**
   * Delete an inventory item from eBay
   */
  static async deleteInventoryItem(host: string, token: string, sku: string): Promise<boolean> {
    const client = this.getClient(host, token);
    try {
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
}
