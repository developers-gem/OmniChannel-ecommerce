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

async function fixLocationAndPublish() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const channel = await db.collection('channelconnections').findOne({ _id: new mongoose.Types.ObjectId('6adf4dede9187d043224ad22') });
  const token = decryptSecret(channel.credentials?.accessToken);
  const host = channel.config?.storeDomain || 'api.sandbox.ebay.com';

  const ukLocKey = 'uk-warehouse-1';
  console.log('Creating/Updating UK warehouse location...');
  try {
    await axios.post(`https://${host}/sell/inventory/v1/location/${ukLocKey}`, {
      location: {
        address: {
          addressLine1: '123 Logistics Way',
          city: 'London',
          stateOrProvince: 'London',
          postalCode: 'EC1A 1BB',
          country: 'GB',
        },
      },
      name: 'UK Main Warehouse',
      merchantLocationStatus: 'ENABLED',
      locationTypes: ['WAREHOUSE'],
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('UK Location created successfully!');
  } catch (err) {
    console.log('Location create status:', err.response?.status, err.response?.data || err.message);
  }

  // Update offer with uk-warehouse-1
  console.log('Updating offer 11981726010 with merchantLocationKey: uk-warehouse-1...');
  const offRes = await axios.get(`https://${host}/sell/inventory/v1/offer/11981726010`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const currentOffer = offRes.data;
  currentOffer.merchantLocationKey = ukLocKey;

  const updateRes = await axios.put(`https://${host}/sell/inventory/v1/offer/11981726010`, currentOffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-GB',
    }
  });
  console.log('Offer updated status:', updateRes.status);

  // Now attempt to publish!
  console.log('Attempting to publish offer 11981726010...');
  try {
    const pubRes = await axios.post(`https://${host}/sell/inventory/v1/offer/11981726010/publish`, {}, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });
    console.log('PUBLISH SUCCESS! Listing ID:', pubRes.data);
  } catch (pubErr) {
    console.error('PUBLISH FAILED:', pubErr.response?.status, JSON.stringify(pubErr.response?.data || pubErr.message, null, 2));
  }

  await mongoose.disconnect();
}
fixLocationAndPublish().catch(console.error);
