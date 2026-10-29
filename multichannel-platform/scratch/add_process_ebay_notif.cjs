const fs = require('fs');
let c = fs.readFileSync('services/api/src/modules/webhooks/webhooks.controller.ts', 'utf8');

const lastBraceIdx = c.lastIndexOf('}');
if (lastBraceIdx !== -1) {
  const method = `
  private static async processEbayNotification(connection: any, payload: any) {
    try {
      const topic = payload?.metadata?.topic || '';
      const data = payload?.notification?.data || payload;

      logger.info(\`Processing eBay notification: topic=\${topic} for connection=\${connection.name}\`);

      const sku = (data.sku || data.SKU || data.customLabel || '').trim();
      const listingId = data.listingId || data.itemId || data.offerId || '';

      if (sku) {
        try {
          const { host, token } = await EbayService.getValidCredentials(connection);
          const fetchedItem = await EbayService.getInventoryItem(host, token, sku);
          if (fetchedItem) {
            await EbayService.ingestEbayProduct({
              organizationId: connection.organizationId,
              connection,
              ebayItem: {
                ...fetchedItem,
                sku,
                listingId: listingId || fetchedItem.listingId,
              },
            });
            logger.info(\`Successfully ingested eBay item SKU \${sku} via webhook\`);
          }
        } catch (fetchErr: any) {
          await EbayService.ingestEbayProduct({
            organizationId: connection.organizationId,
            connection,
            ebayItem: {
              sku,
              listingId,
              title: data.title || sku,
              price: data.price || 0,
              quantity: data.quantity || 0,
            },
          });
          logger.info(\`Ingested eBay item SKU \${sku} directly from webhook payload\`);
        }
      } else {
        const upperTopic = topic.toUpperCase();
        if (
          upperTopic.includes('ITEM') ||
          upperTopic.includes('LISTING') ||
          upperTopic.includes('INVENTORY') ||
          upperTopic.includes('OFFER')
        ) {
          logger.info(\`Triggering store catalog sync for connection \${connection.name} from webhook\`);
          await EbayService.syncAllEbayProducts(connection, connection.organizationId);
        }
      }
    } catch (err: any) {
      logger.error(\`Error processing eBay notification for \${connection.name}: \${err.message}\`);
    }
  }
}
`;
  c = c.slice(0, lastBraceIdx) + method + c.slice(lastBraceIdx + 1);
  fs.writeFileSync('services/api/src/modules/webhooks/webhooks.controller.ts', c, 'utf8');
  console.log('Appended processEbayNotification successfully');
} else {
  console.error('Could not find last brace');
}
