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

async function checkInventory() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const channel = await db.collection('channelconnections').findOne({ _id: new mongoose.Types.ObjectId('6adf4dede9187d043224ad22') });
  const token = decryptSecret(channel.credentials?.accessToken);
  const host = channel.config?.storeDomain || 'api.sandbox.ebay.com';

  const res = await axios.get(`https://${host}/sell/inventory/v1/inventory_item?limit=20`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Total items in eBay inventory:', res.data?.total);
  console.log('SKUs:', res.data?.inventoryItems?.map(i => i.sku));

  // Check offer and listing for LC528XLY
  const offRes = await axios.get(`https://${host}/sell/inventory/v1/offer?sku=LC528XLY`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('LC528XLY offers:', offRes.data?.offers?.map(o => ({ offerId: o.offerId, status: o.status, listingId: o.listing?.listingId })));

  await mongoose.disconnect();
}
checkInventory().catch(console.error);
