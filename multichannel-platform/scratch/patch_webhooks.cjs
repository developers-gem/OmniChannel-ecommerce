const fs = require('fs');
let c = fs.readFileSync('services/api/src/modules/webhooks/webhooks.controller.ts', 'utf8');

// 1. Add EbayService import if missing
if (!c.includes("import { EbayService }")) {
  c = c.replace(
    "import { ShopifyService } from '../../services/shopify.service';",
    "import { ShopifyService } from '../../services/shopify.service';\nimport { EbayService } from '../../services/ebay.service';"
  );
  console.log('Added EbayService import');
}

// 2. Add handleEbayChallenge and update handleEbay
const ebayMethodStart = '  static async handleEbay(req: any, res: Response) {';
const ebayMethodEnd = '  static async handleCustom(req: any, res: Response) {';

const idxStart = c.indexOf(ebayMethodStart);
const idxEnd = c.indexOf(ebayMethodEnd);

if (idxStart !== -1 && idxEnd !== -1) {
  const replacement = `  /**
   * GET /api/v1/webhooks/ebay/:connectionId
   * Handles eBay marketplace notification endpoint verification challenge
   */
  static async handleEbayChallenge(req: any, res: Response) {
    try {
      const { connectionId } = req.params;
      const challengeCode = req.query.challenge_code as string;
      if (!challengeCode) {
        return res.status(400).json({ error: 'Missing challenge_code query parameter' });
      }

      const connection = await ChannelConnection.findById(connectionId);
      const verificationToken = connection?.credentials?.webhookSecret
        ? decryptSecret(connection.credentials.webhookSecret)
        : (connection?.credentials?.apiSecret ? decryptSecret(connection.credentials.apiSecret) : 'multichannel_verification_token');

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host');
      const endpoint = \`\${protocol}://\${host}/api/v1/webhooks/ebay/\${connectionId}\`;

      const challengeResponse = crypto
        .createHash('sha256')
        .update(challengeCode + verificationToken + endpoint)
        .digest('hex');

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({ challengeResponse });
    } catch (err: any) {
      logger.error('eBay challenge verification error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/webhooks/ebay/:connectionId
   * Handles eBay marketplace notifications
   */
  static async handleEbay(req: any, res: Response) {
    try {
      const { connectionId } = req.params;
      const eventId = (req.headers['x-ebay-notification-id'] as string) || req.body?.metadata?.topic || \`ebay_\${Date.now()}\`;
      const topic = req.body?.metadata?.topic || (req.headers['x-ebay-topic'] as string) || 'ebay/notification';

      const connection = await ChannelConnection.findById(connectionId);
      if (!connection || connection.channelType !== ChannelType.EBAY) {
        return res.status(404).json({ success: false, error: 'eBay channel connection not found' });
      }

      // Deduplicate event
      const existing = await WebhookEvent.findOne({
        organizationId: connection.organizationId,
        channelType: ChannelType.EBAY,
        eventId,
      });

      if (existing) {
        return res.status(200).json({ status: 'ignored_duplicate', eventId });
      }

      const eventDoc = await WebhookEvent.create({
        organizationId: connection.organizationId,
        channelConnectionId: connection._id,
        channelType: ChannelType.EBAY,
        topic,
        eventId,
        status: 'PROCESSING',
        payload: req.body,
      });

      // Dispatch notification for eBay events
      try {
        const upperTopic = (topic || '').toUpperCase();
        let notifTitle = 'eBay Notification';
        let notifMsg = \`Received notification "\${topic}" from eBay (\${connection.name || 'Store'}).\`;
        let notifSeverity = NotificationSeverity.INFO;

        if (upperTopic.includes('ITEM_CREATED') || upperTopic.includes('LISTING_CREATED') || upperTopic.includes('CREATE')) {
          notifTitle = 'Product Uploaded on eBay';
          notifMsg = \`A new product or listing was uploaded to eBay (\${connection.name || 'Store'}).\`;
          notifSeverity = NotificationSeverity.SUCCESS;
        } else if (upperTopic.includes('REVISED') || upperTopic.includes('UPDATE') || upperTopic.includes('MODIFIED')) {
          notifTitle = 'Product Modified on eBay';
          notifMsg = \`A product or listing was updated/modified on eBay (\${connection.name || 'Store'}).\`;
        }

        await NotificationService.create({
          organizationId: connection.organizationId,
          title: notifTitle,
          message: notifMsg,
          severity: notifSeverity,
          category: NotificationCategory.INTEGRATION,
          channelType: ChannelType.EBAY,
          link: '/mappings',
        });
      } catch (notifErr: any) {
        logger.warn(\`Could not dispatch eBay notification: \${notifErr.message}\`);
      }

      // Ingest and synchronize eBay product in real time
      await WebhooksController.processEbayNotification(connection, req.body);

      eventDoc.status = 'PROCESSED';
      eventDoc.processedAt = new Date();
      await eventDoc.save();

      return res.status(200).json({ status: 'processed', eventId });
    } catch (err: any) {
      logger.error('eBay webhook processing error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

`;
  c = c.slice(0, idxStart) + replacement + c.slice(idxEnd);
  console.log('Replaced handleEbay successfully');
} else {
  console.error('Could not find start/end markers for handleEbay');
}

// 3. Add processEbayNotification method
if (!c.includes('processEbayNotification(')) {
  const insertMarker = '  private static async processShopifyProductCreate';
  const insIdx = c.indexOf(insertMarker);
  if (insIdx !== -1) {
    const helperCode = `  private static async processEbayNotification(connection: any, payload: any) {
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

`;
    c = c.slice(0, insIdx) + helperCode + c.slice(insIdx);
    console.log('Added processEbayNotification successfully');
  } else {
    console.error('Could not find insert marker for processEbayNotification');
  }
}

fs.writeFileSync('services/api/src/modules/webhooks/webhooks.controller.ts', c, 'utf8');
