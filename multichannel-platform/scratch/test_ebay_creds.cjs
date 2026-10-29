const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const uri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';

async function testPush() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const channel = await db.collection('channelconnections').findOne({ _id: new mongoose.Types.ObjectId('6adf4dede9187d043224ad22') });
  console.log('Channel found:', channel.name, channel.storeDomain, channel.status);
  console.log('Has credentials:', !!channel.credentials);
  console.log('Credential keys:', Object.keys(channel.credentials || {}));
  console.log('Config:', channel.config);

  await mongoose.disconnect();
}
testPush().catch(console.error);
