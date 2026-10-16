import axios from 'axios';
import { decryptSecret } from '../utils/crypto';
import { logger } from '../utils/logger';

export interface ShopifyCredentials {
  domain: string;
  token: string;
}

export class ShopifyService {
  /**
   * Extract and decrypt domain and access token from a ChannelConnection
   */
  static getCredentials(connection: any): ShopifyCredentials {
    let domain = connection.config?.storeDomain || connection.config?.shopDomain || '';
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain.includes('.myshopify.com')) {
      domain = `${domain}.myshopify.com`;
    }

    const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
    if (!rawTokenEnc) {
      throw new Error(`No access token found for Shopify connection: ${connection.name || connection._id}`);
    }

    const token = decryptSecret(rawTokenEnc).trim();
    return { domain, token };
  }

  /**
   * Get an authorized axios instance for the store
   */
  static getClient(domain: string, token: string) {
    return axios.create({
      baseURL: `https://${domain}/admin/api/2024-01`,
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
  }

  /**
   * Retrieve location ID with fallback strategies
   */
  static async getLocationId(domain: string, token: string, inventoryItemId?: string): Promise<string | null> {
    const client = this.getClient(domain, token);

    // Strategy 1: If inventoryItemId is provided, check its existing inventory levels
    if (inventoryItemId) {
      try {
        const invRes = await client.get(`/inventory_levels.json?inventory_item_ids=${inventoryItemId}`);
        const levels = invRes.data?.inventory_levels;
        if (levels && levels.length > 0 && levels[0].location_id) {
          return String(levels[0].location_id);
        }
      } catch (e: any) {
        logger.debug(`Could not get location from inventory_item ${inventoryItemId}: ${e.message}`);
      }
    }

    // Strategy 2: Query /locations.json (requires read_locations scope)
    try {
      const locRes = await client.get('/locations.json');
      const locations = locRes.data?.locations || [];
      const primary = locations.find((l: any) => l.active) || locations[0];
      if (primary?.id) {
        return String(primary.id);
      }
    } catch (e: any) {
      logger.debug(`Could not fetch locations from /locations.json: ${e.message}`);
    }

    return null;
  }

  /**
   * Set inventory quantity for an inventory item on Shopify
   */
  static async setInventoryLevel(
    domain: string,
    token: string,
    inventoryItemId: string,
    quantity: number,
    cachedLocationId?: string
  ): Promise<boolean> {
    try {
      const client = this.getClient(domain, token);
      const locationId = cachedLocationId || (await this.getLocationId(domain, token, inventoryItemId));

      if (!locationId) {
        logger.warn(`Cannot set Shopify inventory: No location ID found for store ${domain}`);
        return false;
      }

      await client.post('/inventory_levels/set.json', {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: Math.max(0, Math.floor(quantity)),
      });

      logger.info(`Updated Shopify inventory for item ${inventoryItemId} on ${domain} to ${quantity}`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to set Shopify inventory for item ${inventoryItemId}: ${error.response?.data?.errors || error.message}`);
      return false;
    }
  }

  /**
   * Update price for a variant on Shopify
   */
  static async updateVariantPrice(
    domain: string,
    token: string,
    variantId: string,
    price: number
  ): Promise<boolean> {
    try {
      const client = this.getClient(domain, token);
      await client.put(`/variants/${variantId}.json`, {
        variant: {
          id: variantId,
          price: price.toFixed(2),
        },
      });

      logger.info(`Updated Shopify price for variant ${variantId} on ${domain} to $${price}`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to update Shopify variant price ${variantId}: ${error.response?.data?.errors || error.message}`);
      return false;
    }
  }

  /**
   * Push and publish a new canonical product to Shopify
   */
  static async publishProduct(
    domain: string,
    token: string,
    product: {
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
    }
  ): Promise<any> {
    const client = this.getClient(domain, token);

    // Format variants for Shopify REST API
    const shopifyVariants = product.variants.map((v, idx) => ({
      title: v.title || (product.variants.length === 1 ? 'Default Title' : `Variant ${idx + 1}`),
      sku: v.sku,
      barcode: v.barcode || undefined,
      price: (v.retailPrice || 0).toFixed(2),
      compare_at_price: v.compareAtPrice ? v.compareAtPrice.toFixed(2) : undefined,
      inventory_management: 'shopify',
      weight: v.weight || undefined,
    }));

    const payload: any = {
      product: {
        title: product.title,
        body_html: product.description || '',
        vendor: product.brand || '',
        product_type: product.category || '',
        tags: product.tags ? product.tags.join(', ') : '',
        variants: shopifyVariants,
      },
    };

    if (product.images && product.images.length > 0) {
      payload.product.images = product.images.map((src) => ({ src }));
    }

    logger.info(`Publishing product "${product.title}" to Shopify store ${domain}...`);
    const res = await client.post('/products.json', payload);
    const createdProduct = res.data?.product;

    if (!createdProduct || !createdProduct.id) {
      throw new Error('Shopify returned an empty product creation response');
    }

    logger.info(`Successfully created product ${createdProduct.id} on Shopify (${createdProduct.title})`);

    // Now set initial inventory levels for each variant
    for (let i = 0; i < product.variants.length; i++) {
      const srcVariant = product.variants[i];
      const createdVariant = createdProduct.variants?.[i];

      if (createdVariant?.inventory_item_id && typeof srcVariant.stockQuantity === 'number') {
        try {
          await this.setInventoryLevel(
            domain,
            token,
            String(createdVariant.inventory_item_id),
            srcVariant.stockQuantity
          );
        } catch (invErr: any) {
          logger.warn(`Could not set initial inventory for published variant ${createdVariant.id}: ${invErr.message}`);
        }
      }
    }

    return createdProduct;
  }
}
