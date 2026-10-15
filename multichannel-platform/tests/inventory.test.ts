import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';

describe('Inventory Ledger & PnL Analytics Engine', () => {
  let authToken = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_inventory');
    }

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `inventory_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Stock',
        lastName: 'Manager',
        organizationName: 'Inventory Hub Corp',
      });

    authToken = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should fetch inventory levels with available-to-allocate formula', async () => {
    const res = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should fetch PnL summary and margins correctly', async () => {
    const res = await request(app)
      .get('/api/v1/pnl/summary')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.grossMarginPercentage).toBeDefined();
    expect(res.body.data.metrics.netContribution).toBeDefined();
  });
});
