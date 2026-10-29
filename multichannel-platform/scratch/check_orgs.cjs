const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const uri = 'mongodb+srv://developers_db_user:cavcDgoftOhXXctW@cluster0.ylgymfy.mongodb.net/multichannel_platform';

async function check() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const channels = await db.collection('channelconnections').find({}).toArray();
  for (const c of channels) {
    console.log(`Channel: ${c._id} | org: ${c.organizationId} | name: ${c.name} | type: ${c.channelType} | status: ${c.status}`);
  }
  const orgs = await db.collection('organizations').find({}).toArray();
  for (const o of orgs) {
    console.log(`Org: ${o._id} | name: ${o.name}`);
  }
  await mongoose.disconnect();
}
check().catch(console.error);
