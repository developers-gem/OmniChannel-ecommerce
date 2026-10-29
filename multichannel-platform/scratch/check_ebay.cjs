const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const uri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';

async function check() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const channels = await db.collection('channelconnections').find({}).toArray();
  console.log('CHANNELS:', JSON.stringify(channels.map(c => ({ _id: c._id, name: c.name, type: c.channelType, status: c.status, domain: c.storeDomain })), null, 2));

  const mappings = await db.collection('productmappings').find({ channelType: 'EBAY' }).toArray();
  console.log('EBAY MAPPINGS:', JSON.stringify(mappings, null, 2));

  const ebayProds = await db.collection('channelproducts').find({ channelType: 'EBAY' }).toArray();
  console.log('EBAY CHANNEL PRODUCTS:', JSON.stringify(ebayProds, null, 2));

  await mongoose.disconnect();
}
check().catch(console.error);
