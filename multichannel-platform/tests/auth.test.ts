import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';

describe('Auth & Tenancy Isolation Module', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_auth');
    }
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should register a new organization and owner user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `merchant_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Jane',
        lastName: 'Doe',
        organizationName: 'Acme Test Corp',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.organization.name).toBe('Acme Test Corp');
    expect(res.body.data.organization.role).toBe('OWNER');
  });

  it('should issue 7-day tokens on registration and allow refreshing tokens', async () => {
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `merchant_7d_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Seven',
        lastName: 'Days',
        organizationName: 'Seven Days Retail Inc',
      });

    expect(regRes.status).toBe(201);
    const { accessToken, refreshToken } = regRes.body.data.tokens;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();

    // Verify token lifetime is 7 days (604,800 seconds)
    const accessPayload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
    const refreshPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64').toString());

    const accessDuration = accessPayload.exp - accessPayload.iat;
    const refreshDuration = refreshPayload.exp - refreshPayload.iat;

    // 7 days = 604,800 seconds
    expect(accessDuration).toBe(7 * 24 * 60 * 60);
    expect(refreshDuration).toBe(7 * 24 * 60 * 60);

    // Test token refresh
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.tokens.accessToken).toBeDefined();
    expect(refreshRes.body.data.tokens.refreshToken).toBeDefined();
  });
});
