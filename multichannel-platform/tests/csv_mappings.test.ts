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
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      } catch (e) {}
    }
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

  it('should detect differential comparison (price, stock, both, unchanged, new) via /inspect', async () => {
    // IMPORT-101 was created with Retail=149.00 and Stock=40
    const testProducts = [
      {
        sku: 'IMPORT-101',
        title: 'Smart Thermostat Updated',
        retailPrice: 199.99, // price changed
        stock: 40,          // stock unchanged
      },
      {
        sku: 'NEW-DIFF-SKU',
        title: 'Brand New Item',
        retailPrice: 49.99,
        stock: 15,
      },
    ];

    const res = await request(app)
      .post('/api/v1/csv/inspect')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ products: testProducts });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.totalRows).toBe(2);
    expect(res.body.data.summary.priceChangedCount).toBe(1);
    expect(res.body.data.summary.newCount).toBe(1);

    const diff1 = res.body.data.diffs.find((d: any) => d.sku === 'IMPORT-101');
    expect(diff1).toBeDefined();
    expect(diff1.changeType).toBe('PRICE_CHANGED');
    expect(diff1.oldPrice).toBe(149);
    expect(diff1.newPrice).toBe(199.99);
    expect(diff1.priceDiff).toBe(50.99);

    const diff2 = res.body.data.diffs.find((d: any) => d.sku === 'NEW-DIFF-SKU');
    expect(diff2).toBeDefined();
    expect(diff2.changeType).toBe('NEW_PRODUCT');
    expect(diff2.isNew).toBe(true);
  });

  it('should apply differential updates exclusively to Master Catalog and record inventory movement', async () => {
    // Update IMPORT-101 with both price and stock change
    const updateCsv = `SKU,Title,Retail,Qty\nIMPORT-101,Smart Thermostat,175.00,85`;

    const res = await request(app)
      .post('/api/v1/csv/import')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        csvContent: updateCsv,
        fileName: 'update_run.csv',
        mappingConfig: {
          sku: 'SKU',
          title: 'Title',
          retailPrice: 'Retail',
          stock: 'Qty',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.updatedCount).toBe(1);
    expect(res.body.data.bothChangedCount).toBe(1);

    // Verify Master Catalog records
    const { ProductVariant, InventoryItem, InventoryMovement } = await import('../services/api/src/database/models');
    const updatedVariant = await ProductVariant.findOne({ sku: 'IMPORT-101' });
    expect(updatedVariant).toBeDefined();
    expect(updatedVariant?.retailPrice).toBe(175);

    const updatedInv = await InventoryItem.findOne({ canonicalVariantId: updatedVariant?._id });
    expect(updatedInv).toBeDefined();
    expect(updatedInv?.trackedStock).toBe(85);

    // Verify inventory movement was logged
    const movement = await InventoryMovement.findOne({
      canonicalVariantId: updatedVariant?._id,
      quantityChanged: 45, // 85 - 40 = 45
    });
    expect(movement).toBeDefined();
    expect(movement?.previousTrackedStock).toBe(40);
    expect(movement?.newTrackedStock).toBe(85);
  });
});
