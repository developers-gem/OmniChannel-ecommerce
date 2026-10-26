import axios from 'axios';
import { decryptSecret } from '../utils/crypto';
import { logger } from '../utils/logger';
import {
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  ChannelProduct,
  ProductMapping,
} from '../database/models';
import {
  ProductStatus,
  ChannelType,
  ChannelProductStatus,
  SyncStatus,
  MappingConfidence,
  MappingStatus,
} from '@multichannel/shared';
import { NotificationService } from './notification.service';

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
      timeout: 25000,
    });
  }

  /**
   * Fetch ALL products from a Shopify store using cursor-based pagination (Link header)
   */
  static async fetchAllProducts(domain: string, token: string): Promise<any[]> {
    const client = this.getClient(domain, token);
    const allProducts: any[] = [];
    let nextUrl: string | null = '/products.json?limit=250';
    let pageCount = 0;

    while (nextUrl) {
      pageCount++;
      logger.info(`[ShopifyService] Fetching products page ${pageCount} from ${domain} (${nextUrl})`);
      const res: any = await client.get(nextUrl);
      const prods: any[] = res.data?.products || [];
      allProducts.push(...prods);

      const linkHeader: any = res.headers?.['link'] || res.headers?.['Link'];
      nextUrl = null;

      if (linkHeader && typeof linkHeader === 'string') {
        const links: string[] = linkHeader.split(',');
        for (const link of links) {
          const match: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
          if (match && match[2] === 'next') {
            nextUrl = match[1];
            break;
          }
        }
      }
    }

    logger.info(`[ShopifyService] Finished pagination for ${domain}. Fetched ${allProducts.length} total products across ${pageCount} pages.`);
    return allProducts;
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
   * Update an existing product on Shopify
   */
  static async updateProduct(
    domain: string,
    token: string,
    shopifyProductId: string,
    product: {
      title?: string;
      description?: string;
      brand?: string;
      category?: string;
      tags?: string[];
      images?: string[];
    }
  ): Promise<any> {
    const client = this.getClient(domain, token);
    const payload: any = {
      product: {
        id: shopifyProductId,
        ...(product.title ? { title: product.title } : {}),
        ...(product.description !== undefined ? { body_html: product.description } : {}),
        ...(product.brand ? { vendor: product.brand } : {}),
        ...(product.category ? { product_type: product.category } : {}),
        ...(product.tags ? { tags: product.tags.join(', ') } : {}),
      },
    };
    if (product.images && product.images.length > 0) {
      payload.product.images = product.images.map((src) => ({ src }));
    }
    const res = await client.put(`/products/${shopifyProductId}.json`, payload);
    return res.data?.product;
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
    const isSingleVariant = product.variants.length === 1;
    const shopifyVariants = product.variants.map((v, idx) => {
      const optionVal =
        v.title && v.title.trim()
          ? v.title.trim()
          : isSingleVariant
          ? 'Default Title'
          : `Variant ${idx + 1}`;

      const item: any = {
        option1: optionVal,
        sku: (v.sku && v.sku.trim()) || `SKU-${Date.now()}-${idx + 1}`,
        price: typeof v.retailPrice === 'number' && !isNaN(v.retailPrice) ? v.retailPrice.toFixed(2) : '0.00',
        inventory_management: 'shopify',
      };

      if (v.barcode && v.barcode.trim()) {
        item.barcode = v.barcode.trim();
      }
      if (typeof v.compareAtPrice === 'number' && v.compareAtPrice > 0 && !isNaN(v.compareAtPrice)) {
        item.compare_at_price = v.compareAtPrice.toFixed(2);
      }
      if (typeof v.weight === 'number' && v.weight > 0 && !isNaN(v.weight)) {
        item.weight = v.weight;
      }

      return item;
    });

    const payload: any = {
      product: {
        title: product.title || 'Untitled Product',
        body_html: product.description || '',
        vendor: product.brand || '',
        product_type: product.category || '',
        tags: product.tags && product.tags.length > 0 ? product.tags.join(', ') : '',
        options: [
          {
            name: isSingleVariant ? 'Title' : 'Option',
            values: shopifyVariants.map((v) => v.option1),
          },
        ],
        variants: shopifyVariants,
      },
    };

    if (product.images && product.images.length > 0) {
      payload.product.images = product.images.map((src) => ({ src }));
    }

    logger.info(`Publishing product "${product.title}" to Shopify store ${domain}...`);
    let res: any;
    try {
      res = await client.post('/products.json', payload);
    } catch (apiErr: any) {
      const rawErrors = apiErr.response?.data?.errors;
      const errorMsg =
        typeof rawErrors === 'string'
          ? rawErrors
          : typeof rawErrors === 'object'
          ? JSON.stringify(rawErrors)
          : apiErr.response?.data?.message || apiErr.message || 'Product creation failed';
      logger.error(`Shopify product creation failed on ${domain}: ${errorMsg}`);
      throw new Error(`Shopify API error: ${errorMsg}`);
    }

    const createdProduct = res.data?.product;
    if (!createdProduct || !createdProduct.id) {
      throw new Error('Shopify returned an empty product creation response');
    }

    logger.info(`Successfully created product ${createdProduct.id} on Shopify (${createdProduct.title})`);

    // Now set initial inventory levels for each variant
    for (let i = 0; i < product.variants.length; i++) {
      const srcVariant = product.variants[i];
      const createdVariant = createdProduct.variants?.[i];

      if (
        createdVariant?.inventory_item_id &&
        typeof srcVariant.stockQuantity === 'number' &&
        srcVariant.stockQuantity > 0
      ) {
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

  /**
   * Delete a product from Shopify store
   */
  static async deleteProduct(domain: string, token: string, shopifyProductId: string): Promise<boolean> {
    try {
      const client = this.getClient(domain, token);
      const cleanId = String(shopifyProductId).replace(/\D/g, '');
      if (!cleanId) return false;

      await client.delete(`/products/${cleanId}.json`);
      logger.info(`Successfully deleted product ${cleanId} from Shopify store ${domain}`);
      return true;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.info(`Product ${shopifyProductId} was already deleted or not found on Shopify store ${domain}`);
        return true;
      }
      logger.error(
        `Failed to delete Shopify product ${shopifyProductId} on ${domain}: ${error.response?.data?.errors || error.message}`
      );
      return false;
    }
  }

  /**
   * Register essential webhooks on a Shopify store
   */
  static async registerWebhooks(domain: string, token: string, connectionId: string): Promise<void> {
    try {
      const client = this.getClient(domain, token);
      const apiBase = (
        process.env.SHOPIFY_WEBHOOK_BASE_URL ||
        (process.env.API_BASE_URL && process.env.API_BASE_URL.startsWith('https://')
          ? process.env.API_BASE_URL
          : 'https://omnichannel-api-m9hx.onrender.com')
      ).replace(/\/$/, '');

      // Shopify only delivers webhooks to https endpoints
      if (!apiBase.startsWith('https://')) {
        logger.warn(`Skipping Shopify webhook registration: API_BASE_URL is not HTTPS (${apiBase})`);
        return;
      }

      const webhookUrl = `${apiBase}/api/v1/webhooks/shopify/${connectionId}`;
      const topics = [
        'products/create',
        'products/update',
        'products/delete',
        'inventory_levels/update',
        'orders/create',
      ];

      // Retrieve existing webhooks to update or create
      let existingWebhooks: any[] = [];
      try {
        const whRes = await client.get('/webhooks.json');
        existingWebhooks = whRes.data?.webhooks || [];
      } catch (getErr: any) {
        logger.warn(`Could not list existing Shopify webhooks: ${getErr.message}`);
      }

      for (const topic of topics) {
        try {
          const match = existingWebhooks.find((w: any) => w.topic === topic);
          if (match) {
            if (match.address !== webhookUrl) {
              await client.put(`/webhooks/${match.id}.json`, {
                webhook: { id: match.id, address: webhookUrl },
              });
              logger.info(`Updated existing Shopify webhook [${topic}] -> ${webhookUrl}`);
            } else {
              logger.debug(`Shopify webhook [${topic}] already up-to-date at ${webhookUrl}`);
            }
          } else {
            await client.post('/webhooks.json', {
              webhook: {
                topic,
                address: webhookUrl,
                format: 'json',
              },
            });
            logger.info(`Registered Shopify webhook [${topic}] -> ${webhookUrl}`);
          }
        } catch (regErr: any) {
          if (regErr.response?.status === 422) {
            logger.debug(`Shopify webhook [${topic}] already registered.`);
          } else {
            logger.warn(
              `Could not register Shopify webhook [${topic}]: ${regErr.response?.data?.errors ? JSON.stringify(regErr.response.data.errors) : regErr.message}`
            );
          }
        }
      }
    } catch (err: any) {
      logger.warn(`Failed during Shopify webhook registration: ${err.message}`);
    }
  }

  /**
   * Ingest a product from Shopify into ChannelProduct, CanonicalProduct, ProductVariant, and ProductMapping
   */
  static async ingestShopifyProduct(params: {
    organizationId: any;
    connection: any;
    shopifyProduct: any;
  }): Promise<{ canonicalProductId: any; mappedCount: number }> {
    const { organizationId, connection, shopifyProduct } = params;
    const productId = String(shopifyProduct.id);
    const variants = Array.isArray(shopifyProduct.variants) ? shopifyProduct.variants : [];

    let mappedCount = 0;
    let canonicalProduct: any = null;

    // 0. Check if this Shopify product was already mapped to a Canonical Product
    const existingChannelProduct = await ChannelProduct.findOne({
      organizationId,
      channelConnectionId: connection._id,
      externalProductId: productId,
    });
    if (existingChannelProduct) {
      const mapping = await ProductMapping.findOne({
        organizationId,
        channelProductId: existingChannelProduct._id,
      });
      if (mapping?.canonicalProductId) {
        canonicalProduct = await CanonicalProduct.findOne({
          _id: mapping.canonicalProductId,
          organizationId,
        });
      }
    }

    // Check if canonical product already exists for this master SKU
    const primarySku = (variants[0]?.sku && variants[0].sku.trim()) || `SHOPIFY-${productId}`;
    const cleanPrimarySku = primarySku.toUpperCase();

    // 1. Try to find existing canonical product by SKU or title if not found via mapping
    if (!canonicalProduct) {
      const existingVariant = await ProductVariant.findOne({
        organizationId,
        sku: cleanPrimarySku,
      });

      if (existingVariant) {
        canonicalProduct = await CanonicalProduct.findOne({
          _id: existingVariant.canonicalProductId,
          organizationId,
        });
      }
    }

    if (!canonicalProduct) {
      canonicalProduct = await CanonicalProduct.findOne({
        organizationId,
        $or: [
          { masterSku: cleanPrimarySku },
          { title: { $regex: `^${shopifyProduct.title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        ],
      });
    }

    // 2. Create or Update Canonical Product
    const images = (shopifyProduct.images || []).map((img: any, idx: number) => ({
      url: typeof img === 'string' ? img : img.src,
      altText: typeof img === 'object' ? img.alt : '',
      position: idx + 1,
      isPrimary: idx === 0,
    }));

    const tags = typeof shopifyProduct.tags === 'string'
      ? shopifyProduct.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(shopifyProduct.tags)
      ? shopifyProduct.tags
      : [];

    if (!canonicalProduct) {
      canonicalProduct = await CanonicalProduct.create({
        organizationId,
        masterSku: cleanPrimarySku,
        title: shopifyProduct.title || 'Untitled Product',
        description: shopifyProduct.body_html || '',
        brand: shopifyProduct.vendor || '',
        category: shopifyProduct.product_type || 'General',
        tags,
        images,
        status: ProductStatus.ACTIVE,
        defaultRetailPrice: parseFloat(variants[0]?.price) || 0,
        defaultCostPrice: 0,
        totalVariants: variants.length || 1,
      });
      logger.info(`Auto-created Canonical Product "${canonicalProduct.title}" (SKU: ${cleanPrimarySku}) from Shopify`);
    } else {
      // Sync incoming Shopify updates to existing Canonical Product
      if (shopifyProduct.title && shopifyProduct.title.trim()) {
        canonicalProduct.title = shopifyProduct.title.trim();
      }
      if (shopifyProduct.body_html !== undefined) {
        canonicalProduct.description = shopifyProduct.body_html;
      }
      if (shopifyProduct.vendor) {
        canonicalProduct.brand = shopifyProduct.vendor;
      }
      if (shopifyProduct.product_type) {
        canonicalProduct.category = shopifyProduct.product_type;
      }
      if (variants[0]?.price) {
        canonicalProduct.defaultRetailPrice = parseFloat(variants[0].price) || canonicalProduct.defaultRetailPrice;
      }
      if (images.length > 0) {
        canonicalProduct.images = images;
      }
      if (tags.length > 0) {
        canonicalProduct.tags = tags;
      }
      canonicalProduct.totalVariants = variants.length || canonicalProduct.totalVariants;
      await canonicalProduct.save();
    }

    // 3. Process each variant
    for (let idx = 0; idx < variants.length; idx++) {
      const v = variants[idx];
      const variantId = String(v.id);
      const price = parseFloat(v.price) || 0;
      const qty = typeof v.inventory_quantity === 'number' ? v.inventory_quantity : 0;
      const vSku = ((v.sku && v.sku.trim()) || `SHOPIFY-${v.id}`).toUpperCase();

      // Upsert ChannelProduct
      const channelProd = await ChannelProduct.findOneAndUpdate(
        {
          organizationId,
          channelConnectionId: connection._id,
          externalProductId: productId,
          externalVariantId: variantId,
        },
        {
          channelType: ChannelType.SHOPIFY,
          title: `${shopifyProduct.title}${variants.length > 1 && v.title && v.title !== 'Default Title' ? ` - ${v.title}` : ''}`,
          sku: vSku,
          barcode: v.barcode || '',
          price,
          inventoryQuantity: qty,
          status: ChannelProductStatus.ACTIVE,
          syncStatus: SyncStatus.SYNCED,
          lastSyncedAt: new Date(),
          rawPayload: { product: shopifyProduct, variant: v },
        },
        { upsert: true, new: true }
      );

      // Upsert ProductVariant on CanonicalProduct
      let canonicalVariant: any = null;
      if (channelProd) {
        const varMapping = await ProductMapping.findOne({
          organizationId,
          channelProductId: channelProd._id,
        });
        if (varMapping?.canonicalVariantId) {
          canonicalVariant = await ProductVariant.findOne({
            _id: varMapping.canonicalVariantId,
            organizationId,
          });
        }
      }

      if (!canonicalVariant) {
        canonicalVariant = await ProductVariant.findOne({
          organizationId,
          canonicalProductId: canonicalProduct._id,
          sku: vSku,
        });
      }

      if (!canonicalVariant) {
        canonicalVariant = await ProductVariant.create({
          organizationId,
          canonicalProductId: canonicalProduct._id,
          sku: vSku,
          title: v.title && v.title !== 'Default Title' ? v.title : canonicalProduct.title,
          barcode: v.barcode || '',
          options: [{ name: 'Title', value: v.title || 'Default Title' }],
          retailPrice: price,
          costPrice: 0,
          weight: typeof v.weight === 'number' ? v.weight : 0,
        });
      } else {
        // Synchronize updated price and properties from Shopify to Canonical Variant
        canonicalVariant.retailPrice = price;
        if (v.barcode) canonicalVariant.barcode = v.barcode;
        if (v.title && v.title !== 'Default Title') canonicalVariant.title = v.title;
        if (typeof v.weight === 'number') canonicalVariant.weight = v.weight;
        await canonicalVariant.save();
      }

      // Upsert InventoryItem
      await InventoryItem.findOneAndUpdate(
        {
          organizationId,
          canonicalVariantId: canonicalVariant._id,
        },
        {
          sku: canonicalVariant.sku,
          trackedStock: qty,
          availableToAllocate: Math.max(0, qty),
          reorderPoint: 5,
        },
        { upsert: true, new: true }
      );


      // Create / update ProductMapping
      await ProductMapping.findOneAndUpdate(
        {
          organizationId,
          channelProductId: channelProd._id,
        },
        {
          canonicalProductId: canonicalProduct._id,
          canonicalVariantId: canonicalVariant._id,
          channelConnectionId: connection._id,
          channelProductId: channelProd._id,
          channelType: ChannelType.SHOPIFY,
          mappingConfidence: MappingConfidence.EXACT_SKU,
          syncPrice: true,
          syncInventory: true,
          status: MappingStatus.MAPPED,
        },
        { upsert: true, new: true }
      );

      mappedCount++;
    }

    return { canonicalProductId: canonicalProduct._id, mappedCount };
  }
}
