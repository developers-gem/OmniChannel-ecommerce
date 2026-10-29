const fs = require('fs');
let c = fs.readFileSync('services/api/src/services/ebay.service.ts', 'utf8');

const target = '  /**\n   * Fetch inventory items with live offer pricing, listingId, and status from eBay\n   */\n  static async getInventoryItems(';

const methodCode = `  /**
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
      const res = await client.get(\`/sell/inventory/v1/inventory_item/\${encodeURIComponent(sku)}\`);
      const item = res.data;
      if (!item) return null;

      let price = 0;
      let itemCurrency = currency;
      let listingId = '';
      let offerStatus = 'UNPUBLISHED';
      let offerId = '';

      try {
        const offRes = await client.get(\`/sell/inventory/v1/offer?sku=\${encodeURIComponent(sku)}\`);
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
      logger.warn(\`Failed to fetch eBay inventory item SKU \${sku}: \${err.message}\`);
      return null;
    }
  }

  /**
   * Fetch inventory items with live offer pricing, listingId, and status from eBay
   */
  static async getInventoryItems(`;

if (c.includes(target)) {
  c = c.replace(target, methodCode);
  fs.writeFileSync('services/api/src/services/ebay.service.ts', c, 'utf8');
  console.log('Added getInventoryItem to ebay.service.ts');
} else {
  console.error('Target not found in ebay.service.ts');
}
