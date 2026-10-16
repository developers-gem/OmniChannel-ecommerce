import axios from 'axios';
import { decryptSecret } from '../utils/crypto';
import { logger } from '../utils/logger';

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
   * Extract and decrypt host and access token from a ChannelConnection
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
}
