const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const uri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';

async function check() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const orgId = new mongoose.Types.ObjectId('6adf4b9ce9187d043224ab54');
  const mappings = await db.collection('productmappings').find({ organizationId: orgId }).toArray();
  console.log('Total mappings for Wiz_Mart_UK:', mappings.length);
  const ebayMappings = mappings.filter(m => m.channelType === 'EBAY');
  console.log('eBay mappings for Wiz_Mart_UK:', JSON.stringify(ebayMappings, null, 2));

  const zeroMapped = await db.collection('canonicalproducts').find({ organizationId: orgId }).limit(10).toArray();
  console.log('Sample canonical prods for Wiz_Mart_UK:', JSON.stringify(zeroMapped.map(p => ({ _id: p._id, sku: p.masterSku, title: p.title })), null, 2));

  await mongoose.disconnect();
}
check().catch(console.error);
