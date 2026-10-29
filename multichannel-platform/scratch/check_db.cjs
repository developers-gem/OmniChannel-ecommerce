const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const uri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';

async function check() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const channels = await db.collection('channelconnections').find({}).toArray();
  console.log('CHANNELS:', JSON.stringify(channels.map(c => ({ _id: c._id, name: c.name, type: c.channelType, status: c.status, domain: c.storeDomain, marketplace: c.config?.marketplaceId })), null, 2));

  const mappings = await db.collection('productmappings').find({ channelType: 'EBAY' }).toArray();
  console.log('EBAY MAPPINGS COUNT:', mappings.length);

  const chProds = await db.collection('channelproducts').find({ channelType: 'EBAY' }).toArray();
  console.log('EBAY CHANNEL PRODUCTS COUNT:', chProds.length);
  console.log('EBAY CHANNEL PRODUCTS:', JSON.stringify(chProds.map(p => ({ _id: p._id, sku: p.sku, title: p.title, extId: p.externalProductId, extVarId: p.externalVariantId })), null, 2));

  const prods = await db.collection('canonicalproducts').find({ masterSku: { $in: ['6ZD17AF', 'LC980Y', 'LC528XLY', 'LC528XLM', 'LC528XLC'] } }).toArray();
  console.log('FOUND PRODUCTS:', JSON.stringify(prods.map(p => ({ _id: p._id, sku: p.masterSku, title: p.title })), null, 2));

  await mongoose.disconnect();
}
check().catch(console.error);
