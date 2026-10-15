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

  it('should reject login with incorrect credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
