const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const crypto = require('crypto');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const uri = process.env.MONGODB_URI;
const encKey = process.env.ENCRYPTION_KEY || 'default-secret-key-change-in-production-min32';

function getKey() {
  return crypto.scryptSync(encKey, 'multichannel-salt', 32);
}

function decryptSecret(cipherText) {
  const parts = cipherText.split(':');
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function testCreds() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const channel = await db.collection('channelconnections').findOne({ _id: new mongoose.Types.ObjectId('6adf4dede9187d043224ad22') });
  const rawTokenEnc = channel.credentials?.accessToken;
  const rawRefreshEnc = channel.credentials?.refreshToken;
  console.log('Expires at:', channel.credentials?.expiresAt);

  const token = decryptSecret(rawTokenEnc);
  const refreshToken = decryptSecret(rawRefreshEnc);
  console.log('Decrypted token length:', token.length);
  console.log('Decrypted refresh token length:', refreshToken.length);

  const host = channel.config?.storeDomain || 'api.sandbox.ebay.com';
  console.log('Host:', host);

  try {
    const res = await axios.get(`https://${host}/sell/inventory/v1/inventory_item?limit=5`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });
    console.log('Inventory API status:', res.status);
    console.log('Inventory items found:', res.data?.inventoryItems?.length || 0);
    if (res.data?.inventoryItems) {
      console.log('SKUs in inventory:', res.data.inventoryItems.map(i => i.sku));
    }
  } catch (err) {
    console.error('API Error:', err.response?.status, err.response?.data || err.message);
  }

  await mongoose.disconnect();
}
testCreds().catch(console.error);
