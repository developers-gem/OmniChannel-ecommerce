import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';

describe('Canonical Catalog & Mapping Engine', () => {
  let authToken = '';
  let createdProductId = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_products');
    }

    // Register user to get JWT token
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `catalog_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Tester',
        lastName: 'Admin',
        organizationName: 'Catalog Enterprise',
      });

    authToken = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should create a canonical product with variants and initial stock', async () => {
    const sku = `SKU-MASTER-${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Ergonomic Desk Chair',
        masterSku: sku,
        brand: 'WorkPro',
        category: 'Office Furniture',
        defaultCostPrice: 85.0,
        defaultRetailPrice: 199.99,
        variants: [
          {
            sku: `${sku}-BLK`,
            title: 'Black',
            costPrice: 85.0,
            retailPrice: 199.99,
            initialStock: 50,
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Ergonomic Desk Chair');
    expect(res.body.data.variants).toHaveLength(1);
    createdProductId = res.body.data._id;
  });

  it('should list canonical products with populated stock', async () => {
    const res = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
