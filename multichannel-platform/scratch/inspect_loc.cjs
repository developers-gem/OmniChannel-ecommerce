const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const axios = require('axios');
const dotenv = require('dotenv');
const crypto = require('crypto');
dotenv.config();

const encKey = process.env.ENCRYPTION_KEY || 'default-secret-key-change-in-production-min32';
function getKey() { return crypto.scryptSync(encKey, 'multichannel-salt', 32); }
function decryptSecret(cipherText) {
  const parts = cipherText.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(parts[0], 'hex'));
  decipher.setAuthTag(Buffer.from(parts[1], 'hex'));
  return decipher.update(parts[2], 'hex', 'utf8') + decipher.final('utf8');
}

async function inspectLoc() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const channel = await db.collection('channelconnections').findOne({ _id: new mongoose.Types.ObjectId('6adf4dede9187d043224ad22') });
  const token = decryptSecret(channel.credentials?.accessToken);
  const host = channel.config?.storeDomain || 'api.sandbox.ebay.com';

  const res = await axios.get(`https://${host}/sell/inventory/v1/location/sandbox-warehouse-1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Location details:', JSON.stringify(res.data, null, 2));

  // Check offer 11981726010 details
  const offRes = await axios.get(`https://${host}/sell/inventory/v1/offer/11981726010`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Offer details:', JSON.stringify(offRes.data, null, 2));

  await mongoose.disconnect();
}
inspectLoc().catch(console.error);
