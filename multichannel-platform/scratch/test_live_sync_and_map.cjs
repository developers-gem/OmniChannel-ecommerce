const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function testSync() {
  const mongoUri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Load models
  const ChannelConnection = mongoose.model('ChannelConnection', new mongoose.Schema({}, { strict: false }));
  const CanonicalProduct = mongoose.model('CanonicalProduct', new mongoose.Schema({}, { strict: false }));
  const ProductVariant = mongoose.model('ProductVariant', new mongoose.Schema({}, { strict: false }));
  const ProductMapping = mongoose.model('ProductMapping', new mongoose.Schema({}, { strict: false }));
  const ChannelProduct = mongoose.model('ChannelProduct', new mongoose.Schema({}, { strict: false }));
  const InventoryItem = mongoose.model('InventoryItem', new mongoose.Schema({}, { strict: false }));

  const orgId = new mongoose.Types.ObjectId('6adf4b9ce9187d043224ab54');
  const conn = await ChannelConnection.findOne({ organizationId: orgId, channelType: 'EBAY' });
  console.log('Found eBay Connection:', conn ? conn.name : 'None');

  // Check current products in org
  const products = await CanonicalProduct.find({ organizationId: orgId });
  console.log(`Found ${products.length} canonical products in organization:`);
  products.forEach(p => console.log(` - [${p._id}] SKU: ${p.masterSku} | Title: ${p.title}`));

  // Check current variants
  const variants = await ProductVariant.find({ organizationId: orgId });
  console.log(`Found ${variants.length} variants:`);
  variants.forEach(v => console.log(` - Variant SKU: ${v.sku} | Price: ${v.retailPrice} | Canonical: ${v.canonicalProductId}`));

  // Check existing mappings
  const mappings = await ProductMapping.find({ organizationId: orgId, channelConnectionId: conn._id });
  console.log(`Found ${mappings.length} mappings for eBay channel:`);
  mappings.forEach(m => console.log(` - Variant: ${m.canonicalVariantId} | Status: ${m.status} | Confidence: ${m.mappingConfidence}`));

  await mongoose.disconnect();
}

testSync().catch(console.error);
