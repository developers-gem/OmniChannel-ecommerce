import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import app from '../services/api/src/index';
import { ChannelConnection, WebhookEvent, Order } from '../services/api/src/database/models';
import { ChannelType, ChannelStatus } from '@multichannel/shared';
import { encryptSecret } from '../services/api/src/utils/crypto';
import { validateSafeUrl } from '../services/api/src/utils/ssrf';

describe('Webhooks & SSRF Security Engine', () => {
  let orgId: mongoose.Types.ObjectId;
  let shopifyConnId: mongoose.Types.ObjectId;
  const webhookSecret = 'shpss_secret_key_12345';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_webhooks');
    }

    orgId = new mongoose.Types.ObjectId();
    const conn = await ChannelConnection.create({
      organizationId: orgId,
      channelType: ChannelType.SHOPIFY,
      name: 'Test Shopify Store',
      status: ChannelStatus.ACTIVE,
      credentials: {
        shopDomain: 'test-store.myshopify.com',
        accessToken: encryptSecret('shpat_test_token'),
        webhookSecret: encryptSecret(webhookSecret),
      },
    });
    shopifyConnId = conn._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should accept valid Shopify order webhook with matching HMAC signature and create order', async () => {
    const payload = {
      id: 987654321,
      order_number: 1042,
      total_price: '189.50',
      currency: 'USD',
      financial_status: 'paid',
      customer: {
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice.smith@example.com',
      },
      line_items: [
        {
          id: 112233,
          sku: 'SHOE-AIR-01',
          title: 'Air Comfort Sneakers',
          price: '189.50',
          quantity: 1,
        },
      ],
    };

    const rawPayload = JSON.stringify(payload);
    const validHmac = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('base64');
    const eventId = `sh_evt_${Date.now()}`;

    const res = await request(app)
      .post(`/api/v1/webhooks/shopify/${shopifyConnId}`)
      .set('x-shopify-hmac-sha256', validHmac)
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-webhook-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');
    expect(res.body.eventId).toBe(eventId);

    // Verify WebhookEvent logged
    const loggedEvent = await WebhookEvent.findOne({ eventId });
    expect(loggedEvent).toBeDefined();
    expect(loggedEvent?.status).toBe('PROCESSED');

    // Verify Order created in DB
    const createdOrder = await Order.findOne({ externalOrderId: '987654321' });
    expect(createdOrder).toBeDefined();
    expect(createdOrder?.totalPrice).toBe(189.5);
    expect(createdOrder?.orderNumber).toBe('#1042');
  });

  it('should reject Shopify webhook with invalid HMAC signature', async () => {
    const payload = { id: 987654322, order_number: 1043 };
    const rawPayload = JSON.stringify(payload);

    const res = await request(app)
      .post(`/api/v1/webhooks/shopify/${shopifyConnId}`)
      .set('x-shopify-hmac-sha256', 'invalid_signature_base64_string')
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-webhook-id', `sh_evt_invalid_${Date.now()}`)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should detect duplicate webhook events and return ignored_duplicate (idempotency)', async () => {
    const payload = { id: 987654323, order_number: 1044 };
    const rawPayload = JSON.stringify(payload);
    const validHmac = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('base64');
    const eventId = `sh_evt_dup_${Date.now()}`;

    // First send
    const res1 = await request(app)
      .post(`/api/v1/webhooks/shopify/${shopifyConnId}`)
      .set('x-shopify-hmac-sha256', validHmac)
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-webhook-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res1.status).toBe(200);
    expect(res1.body.status).toBe('processed');

    // Duplicate replay
    const res2 = await request(app)
      .post(`/api/v1/webhooks/shopify/${shopifyConnId}`)
      .set('x-shopify-hmac-sha256', validHmac)
      .set('x-shopify-topic', 'orders/create')
      .set('x-shopify-webhook-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawPayload);

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('ignored_duplicate');
  });

  it('should block SSRF attacks targeting AWS/cloud metadata (169.254.169.254)', async () => {
    const check = await validateSafeUrl('http://169.254.169.254/latest/meta-data/');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('strictly forbidden (SSRF Protection)');
  });

  it('should block SSRF attacks targeting internal RFC1918 private IPs in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const check = await validateSafeUrl('http://10.0.0.1/admin');
      expect(check.valid).toBe(false);
      expect(check.error).toContain('Only HTTPS endpoints are permitted');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should accept valid public HTTPS API endpoints', async () => {
    const check = await validateSafeUrl('https://api.github.com');
    expect(check.valid).toBe(true);
  });
});
