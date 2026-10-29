const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function verifyAllMappings() {
  const mongoUri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';
  await mongoose.connect(mongoUri);

  const { ChannelConnection, CanonicalProduct, ProductVariant, ChannelProduct, ProductMapping } = require('./services/api/dist/database/models/index.js');

  const orgId = new mongoose.Types.ObjectId('6adf4b9ce9187d043224ab54');
  const conn = await ChannelConnection.findOne({ organizationId: orgId, channelType: 'EBAY' });

  const mappings = await ProductMapping.find({
    organizationId: orgId,
    channelConnectionId: conn._id,
    status: 'MAPPED',
  })
    .populate('canonicalProductId')
    .populate('canonicalVariantId')
    .populate('channelProductId');

  console.log(`\n========================================`);
  console.log(`TOTAL ACTIVE EBAY MAPPINGS: ${mappings.length}`);
  console.log(`========================================`);
  mappings.forEach((m, idx) => {
    const cp = m.canonicalProductId;
    const v = m.canonicalVariantId;
    const ch = m.channelProductId;
    console.log(
      `${idx + 1}. SKU: ${v?.sku || 'N/A'} | Title: ${cp?.title || 'N/A'} | eBay Listing ID: ${ch?.externalProductId || 'N/A'} | Price: ${ch?.price} | Stock: ${ch?.inventoryQuantity} | Status: ${m.status}`
    );
  });

  await mongoose.disconnect();
}

verifyAllMappings().catch(console.error);
