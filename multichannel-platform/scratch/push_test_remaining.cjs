const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function pushRemainingProducts() {
  const mongoUri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const { EbayService } = require('./services/api/dist/services/ebay.service.js');
  const { ChannelConnection, CanonicalProduct, ProductVariant, InventoryItem, ChannelProduct, ProductMapping } = require('./services/api/dist/database/models/index.js');

  const orgId = new mongoose.Types.ObjectId('6adf4b9ce9187d043224ab54');
  const conn = await ChannelConnection.findOne({ organizationId: orgId, channelType: 'EBAY' });
  console.log('Using eBay connection:', conn.name);

  const { host, token } = await EbayService.getValidCredentials(conn);
  const marketplaceId = 'EBAY_GB';

  // Push LC528XLM and LC528XLC
  const targetSkus = ['LC528XLM', 'LC528XLC'];

  for (const sku of targetSkus) {
    console.log(`\n--- Publishing ${sku} to eBay ---`);
    const variant = await ProductVariant.findOne({ organizationId: orgId, sku });
    if (!variant) {
      console.log(`Variant ${sku} not found`);
      continue;
    }
    const product = await CanonicalProduct.findById(variant.canonicalProductId);
    const invItem = await InventoryItem.findOne({ organizationId: orgId, canonicalVariantId: variant._id });

    const price = variant.retailPrice || product.defaultRetailPrice || 67.62;
    const stock = invItem ? invItem.availableToAllocate : 10;
    const images = (product.images || []).map(img => typeof img === 'string' ? img : img.url).filter(Boolean);

    console.log(`Calling setInventoryItem for ${sku}: price=${price}, stock=${stock}, title=${product.title}`);
    const setResult = await EbayService.setInventoryItem(host, token, sku, {
      title: product.title,
      description: product.description || product.title,
      quantity: stock,
      price,
      images,
      brand: product.brand || 'Brother',
      marketplaceId,
    });

    console.log(`Result for ${sku}:`, setResult);

    if (setResult.success) {
      const listingId = setResult.listingId || sku;
      const chProd = await ChannelProduct.findOneAndUpdate(
        {
          organizationId: orgId,
          channelConnectionId: conn._id,
          sku,
        },
        {
          channelType: 'EBAY',
          externalProductId: listingId,
          externalVariantId: sku,
          title: product.title,
          sku,
          price,
          inventoryQuantity: stock,
          status: 'ACTIVE',
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
          rawPayload: { listingId, offerId: setResult.offerId },
        },
        { upsert: true, new: true }
      );

      const mapping = await ProductMapping.findOneAndUpdate(
        {
          organizationId: orgId,
          canonicalVariantId: variant._id,
          channelConnectionId: conn._id,
        },
        {
          $set: {
            canonicalProductId: product._id,
            canonicalVariantId: variant._id,
            channelConnectionId: conn._id,
            channelProductId: chProd._id,
            channelType: 'EBAY',
            mappingConfidence: 'EXACT_SKU',
            syncPrice: true,
            syncInventory: true,
            status: 'MAPPED',
            updatedAt: new Date(),
          },
          $unset: {
            unmappedAt: 1,
            unmappedReason: 1,
          },
        },
        { upsert: true, new: true }
      );

      console.log(`Successfully mapped ${sku} -> listingId: ${listingId}, mappingId: ${mapping._id}`);
    }
  }

  await mongoose.disconnect();
}

pushRemainingProducts().catch(console.error);
