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

async function testPushProduct() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const channel = await db.collection('channelconnections').findOne({ _id: new mongoose.Types.ObjectId('6adf4dede9187d043224ad22') });
  const token = decryptSecret(channel.credentials?.accessToken);
  const host = channel.config?.storeDomain || 'api.sandbox.ebay.com';

  const sku = 'LC528XLY';
  const payload = {
    locale: 'en_GB',
    availability: {
      shipToLocationAvailability: {
        quantity: 5,
      },
    },
    condition: 'NEW',
    product: {
      title: 'LC528XLY Yellow Ink Cartridge',
      description: 'Ultra high yield yellow ink cartridge',
      imageUrls: ['https://i.ebayimg.com/images/g/default/s-l1600.jpg'],
      aspects: {
        Brand: ['Brother'],
        Type: ['Original'],
      },
    },
  };

  try {
    console.log('Sending PUT inventory_item...');
    const invRes = await axios.put(`https://${host}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-GB',
      }
    });
    console.log('PUT inventory_item response status:', invRes.status);

    // Now test creating offer
    console.log('Checking location...');
    const locRes = await axios.get(`https://${host}/sell/inventory/v1/location?limit=5`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Locations:', locRes.data);
    const locKey = locRes.data?.locations?.[0]?.merchantLocationKey || 'sandbox-warehouse-1';

    console.log('Checking fulfillment policy...');
    const fRes = await axios.get(`https://${host}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_GB`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Fulfillment policies:', fRes.data);

    console.log('Checking payment policy...');
    const pRes = await axios.get(`https://${host}/sell/account/v1/payment_policy?marketplace_id=EBAY_GB`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Payment policies:', pRes.data);

    console.log('Checking return policy...');
    const rRes = await axios.get(`https://${host}/sell/account/v1/return_policy?marketplace_id=EBAY_GB`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Return policies:', rRes.data);

    const offerPayload = {
      sku,
      marketplaceId: 'EBAY_GB',
      format: 'FIXED_PRICE',
      availableQuantity: 5,
      categoryId: '175670', // Ink Cartridges
      pricingSummary: {
        price: {
          currency: 'GBP',
          value: '19.99',
        },
      },
      merchantLocationKey: locKey,
      listingPolicies: {
        fulfillmentPolicyId: fRes.data?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId,
        paymentPolicyId: pRes.data?.paymentPolicies?.[0]?.paymentPolicyId,
        returnPolicyId: rRes.data?.returnPolicies?.[0]?.returnPolicyId,
      }
    };
    console.log('Sending POST offer...', offerPayload);
    const offRes = await axios.post(`https://${host}/sell/inventory/v1/offer`, offerPayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-GB',
      }
    });
    console.log('Offer created:', offRes.data);
    const offerId = offRes.data?.offerId;

    if (offerId) {
      console.log('Attempting to publish offer...');
      const pubRes = await axios.post(`https://${host}/sell/inventory/v1/offer/${offerId}/publish`, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      console.log('Publish result:', pubRes.data);
    }
  } catch (err) {
    console.error('FAILED AT STEP:', err.response?.status, JSON.stringify(err.response?.data || err.message, null, 2));
  }

  await mongoose.disconnect();
}
testPushProduct().catch(console.error);
