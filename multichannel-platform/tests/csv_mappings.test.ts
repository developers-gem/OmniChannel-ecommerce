import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';

describe('CSV Ingestion & Mapping Signals Engine', () => {
  let authToken = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_csv');
    }

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `csv_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Data',
        lastName: 'Specialist',
        organizationName: 'Data Import Corp',
      });

    authToken = res.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should parse and preview CSV content with headers and row preview', async () => {
    const rawCsv = `SKU,Title,Price,Stock\nTEST-SKU-1,Wireless Mouse,29.99,100\nTEST-SKU-2,Mechanical Keyboard,89.99,50`;

    const res = await request(app)
      .post('/api/v1/csv/preview')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ csvContent: rawCsv });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.headers).toEqual(['SKU', 'Title', 'Price', 'Stock']);
    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.previewRows).toHaveLength(2);
  });

  it('should execute CSV bulk import with mapped columns', async () => {
    const rawCsv = `SKU,Title,Brand,Category,Cost,Retail,Qty\nIMPORT-101,Smart Thermostat,EcoHome,Smart Home,60.00,149.00,40`;

    const res = await request(app)
      .post('/api/v1/csv/import')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        csvContent: rawCsv,
        fileName: 'thermostats.csv',
        mappingConfig: {
          sku: 'SKU',
          title: 'Title',
          brand: 'Brand',
          category: 'Category',
          costPrice: 'Cost',
          retailPrice: 'Retail',
          stock: 'Qty',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.successfulRows).toBe(1);
    expect(res.body.data.failedRows).toBe(0);
  });

  it('should retrieve mapping suggestions', async () => {
    const res = await request(app)
      .get('/api/v1/mappings/suggestions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
