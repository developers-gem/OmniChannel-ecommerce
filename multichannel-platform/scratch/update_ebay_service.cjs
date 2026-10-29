const fs = require('fs');
let code = fs.readFileSync('services/api/src/services/ebay.service.ts', 'utf8');

// 1. Update imports
const oldModelImport = "import { ChannelConnection } from '../database/models';";
const newModelImport = `import {
  ChannelConnection,
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  ChannelProduct,
  ProductMapping,
} from '../database/models';`;

if (code.includes(oldModelImport)) {
  code = code.replace(oldModelImport, newModelImport);
}

const oldSharedImport = "import { ChannelStatus } from '@multichannel/shared';";
const newSharedImport = `import {
  ChannelStatus,
  ChannelType,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
  MappingConfidence,
  ProductStatus,
} from '@multichannel/shared';`;

if (code.includes(oldSharedImport)) {
  code = code.replace(oldSharedImport, newSharedImport);
}

// 2. Update ensureMerchantLocation
const oldEnsureLoc = `  static async ensureMerchantLocation(client: any): Promise<string> {
    try {
      const res = await client.get('/sell/inventory/v1/location?limit=5');
      const locs = res.data?.locations || [];
      if (locs.length > 0 && locs[0].merchantLocationKey) {
        return locs[0].merchantLocationKey;
      }
    } catch (e: any) {
      logger.warn(\`Could not list eBay merchant locations: \${e.message}\`);
    }

    const defaultKey = 'sandbox-warehouse-1';
    try {
      await client.post(\`/sell/inventory/v1/location/\${defaultKey}\`, {
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
    } catch {
      return defaultKey;
    }
  }`;

const newEnsureLoc = `  static async ensureMerchantLocation(client: any, marketplaceId = 'EBAY_GB'): Promise<string> {
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
      logger.warn(\`Could not list eBay merchant locations: \${e.message}\`);
    }

    const defaultKey = isUK ? 'uk-warehouse-1' : 'us-warehouse-1';
    try {
      await client.post(\`/sell/inventory/v1/location/\${defaultKey}\`, {
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
  }`;

if (code.includes(oldEnsureLoc)) {
  code = code.replace(oldEnsureLoc, newEnsureLoc);
} else {
  console.log('WARNING: oldEnsureLoc not matched');
}

// 3. Update call in setInventoryItem
const oldCall = "const merchantLocationKey = await this.ensureMerchantLocation(client);";
const newCall = "const merchantLocationKey = await this.ensureMerchantLocation(client, marketplaceId);";
code = code.replace(oldCall, newCall);

// 4. Update createOrUpdateAndPublishOffer error return to preserve listingId fallback
const oldPubCatch = `      const errMsg = pubErr.response?.data?.errors?.[0]?.message || pubErr.message;
      logger.warn(\`Publish offer \${offerId} for SKU \${sku} returned: \${errMsg}\`);
      return { offerId, listingId: existingListingId, status: 'PUBLISH_PENDING', error: errMsg };`;

const newPubCatch = `      const errMsg = pubErr.response?.data?.errors?.[0]?.message || pubErr.message;
      logger.warn(\`Publish offer \${offerId} for SKU \${sku} returned: \${errMsg}\`);
      return { offerId, listingId: existingListingId || offerId, status: 'PUBLISH_PENDING', error: errMsg };`;

code = code.replace(oldPubCatch, newPubCatch);

// 5. Add ingestEbayProduct and syncAllEbayProducts
const methodsToAdd = `
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
        { title: { $regex: \`^\${title.trim().replace(/[.*+?^$\{}()|[\\]\\\\]/g, '\\\\$&')}$\`, $options: 'i' } },
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
        logger.warn(\`Failed to ingest eBay item SKU \${item.sku}: \${err.message}\`);
      }
    }

    connection.lastSyncAt = new Date();
    await connection.save();

    return { totalItems: items.length, syncedCount };
  }
`;

// Insert before the closing brace of EbayService
const lastBraceIdx = code.lastIndexOf('}');
if (lastBraceIdx !== -1) {
  code = code.slice(0, lastBraceIdx) + methodsToAdd + '\n}\n';
  fs.writeFileSync('services/api/src/services/ebay.service.ts', code, 'utf8');
  console.log('SUCCESS: ebay.service.ts updated successfully!');
} else {
  console.log('ERROR: Could not find closing brace');
}
