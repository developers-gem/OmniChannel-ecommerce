import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';
import {
  CanonicalProduct,
  ProductVariant,
  ChannelConnection,
  ChannelProduct,
  ProductMapping,
} from '../services/api/src/database/models';
import { ChannelType, ChannelStatus, MappingConfidence, MappingStatus, ChannelProductStatus } from '@multichannel/shared';
import { ShopifyService } from '../services/api/src/services/shopify.service';
import { EbayService } from '../services/api/src/services/ebay.service';

import { encryptSecret } from '../services/api/src/utils/crypto';

describe('Unmapped Products & Store Deletion Lifecycle', () => {
  let authToken = '';
  let tenantId = '';
  let connectionId = '';
  let canonicalProductId = '';
  let canonicalVariantId = '';
  let channelProductId = '';
  let mappingId = '';

  let shopifyDeleteSpy: any;
  let ebayDeleteSpy: any;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_unmapped');
    }

    // Spy on external store deletion methods to verify they get called during unmapping
    shopifyDeleteSpy = vi.spyOn(ShopifyService, 'deleteProduct').mockResolvedValue(true);
    ebayDeleteSpy = vi.spyOn(EbayService, 'deleteInventoryItem').mockResolvedValue(true);

    // Register user & org
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `unmap_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Unmap',
        lastName: 'Tester',
        organizationName: 'Unmapped Testing Org',
      });

    authToken = regRes.body.data.tokens.accessToken;
    tenantId = regRes.body.data.organization.id;

    // Create a mock Shopify connection
    const conn = await ChannelConnection.create({
      organizationId: tenantId,
      name: 'Main Shopify Store',
      channelType: ChannelType.SHOPIFY,
      status: ChannelStatus.ACTIVE,
      config: {
        storeDomain: 'test-shop.myshopify.com',
      },
      credentials: {
        accessToken: encryptSecret('shpat_mock_token_123'),
      },
    });
    connectionId = conn._id.toString();

    // Create a Canonical Product and Variant
    const prod = await CanonicalProduct.create({
      organizationId: tenantId,
      title: 'Premium Snowboard',
      masterSku: 'SNOW-001',
      brand: 'Alpine',
      category: 'Sports',
    });
    canonicalProductId = prod._id.toString();

    const variant = await ProductVariant.create({
      organizationId: tenantId,
      canonicalProductId: prod._id,
      title: 'Snowboard 156cm',
      sku: 'SNOW-001-156',
      costPrice: 150,
      retailPrice: 399,
      stockQuantity: 15,
    });
    canonicalVariantId = variant._id.toString();

    // Create a Channel Product (simulating imported Shopify product)
    const chProd = await ChannelProduct.create({
      organizationId: tenantId,
      channelConnectionId: conn._id,
      channelType: ChannelType.SHOPIFY,
      externalProductId: 'gid://shopify/Product/9876543210',
      externalVariantId: 'gid://shopify/ProductVariant/1234567890',
      title: 'Premium Snowboard',
      sku: 'SNOW-001-156',
      price: 399,
      inventoryQuantity: 15,
      status: ChannelProductStatus.ACTIVE,
    });
    channelProductId = chProd._id.toString();

    // Create active Product Mapping
    const mapping = await ProductMapping.create({
      organizationId: tenantId,
      canonicalProductId: prod._id,
      canonicalVariantId: variant._id,
      channelConnectionId: conn._id,
      channelProductId: chProd._id,
      channelType: ChannelType.SHOPIFY,
      status: MappingStatus.MAPPED,
      mappingConfidence: MappingConfidence.EXACT_SKU,
      syncInventory: true,
      syncPrice: true,
    });
    mappingId = mapping._id.toString();
  });

  afterAll(async () => {
    shopifyDeleteSpy.mockRestore();
    ebayDeleteSpy.mockRestore();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should list active mapping on /api/v1/mappings', async () => {
    const res = await request(app)
      .get('/api/v1/mappings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]._id).toBe(mappingId);
  });

  it('should unmap product and delete it from the external Shopify store', async () => {
    const res = await request(app)
      .delete(`/api/v1/mappings/${mappingId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.storeDeleted).toBe(true);

    // Verify ShopifyService.deleteProduct was invoked with correct arguments
    expect(shopifyDeleteSpy).toHaveBeenCalledWith(
      'test-shop.myshopify.com',
      'shpat_mock_token_123',
      'gid://shopify/Product/9876543210'
    );

    // Verify mapping is no longer in active mappings
    const activeRes = await request(app)
      .get('/api/v1/mappings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(activeRes.body.data.length).toBe(0);
  });

  it('should list the unmapped product on /api/v1/mappings/unmapped with store details', async () => {
    const res = await request(app)
      .get('/api/v1/mappings/unmapped')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);

    const unmapped = res.body.data[0];
    expect(unmapped._id).toBe(mappingId);
    expect(unmapped.status).toBe(MappingStatus.UNMAPPED);
    expect(unmapped.unmappedAt).toBeDefined();

    // Verify store details are properly populated
    expect(unmapped.channelConnectionId.name).toBe('Main Shopify Store');
    expect(unmapped.channelConnectionId.channelType).toBe(ChannelType.SHOPIFY);
    expect(unmapped.canonicalProductId.title).toBe('Premium Snowboard');
  });

  it('should re-map the product when calling /api/v1/mappings/:id/remap', async () => {
    // Spy on publishProduct
    const publishSpy = vi.spyOn(ShopifyService, 'publishProduct').mockResolvedValue({
      id: 99999999,
      title: 'Premium Snowboard',
      variants: [{ id: 88888888 }],
    });

    const res = await request(app)
      .post(`/api/v1/mappings/${mappingId}/remap`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Check mapping status is MAPPED again
    const dbMapping = await ProductMapping.findById(mappingId);
    expect(dbMapping?.status).toBe(MappingStatus.MAPPED);
    expect(dbMapping?.unmappedAt).toBeUndefined();

    // Check /mappings/unmapped is now empty
    const unmappedRes = await request(app)
      .get('/api/v1/mappings/unmapped')
      .set('Authorization', `Bearer ${authToken}`);

    expect(unmappedRes.body.data.length).toBe(0);

    // Check /mappings has it back
    const activeRes = await request(app)
      .get('/api/v1/mappings')
      .set('Authorization', `Bearer ${authToken}`);

    expect(activeRes.body.data.length).toBe(1);

    publishSpy.mockRestore();
  });

  it('should permanently delete record on /api/v1/mappings/:id/permanent', async () => {
    const res = await request(app)
      .delete(`/api/v1/mappings/${mappingId}/permanent`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const exists = await ProductMapping.findById(mappingId);
    expect(exists).toBeNull();
  });

  it('should list products with 0 active mappings on /api/v1/products/zero-mapped', async () => {
    // Create an unmapped product
    const zeroProd = await CanonicalProduct.create({
      organizationId: tenantId,
      title: 'Zero Mapped Helmet',
      masterSku: 'HELMET-001',
      brand: 'SafetyFirst',
      category: 'Accessories',
      defaultRetailPrice: 89.99,
    });

    await ProductVariant.create({
      organizationId: tenantId,
      canonicalProductId: zeroProd._id,
      title: 'Medium',
      sku: 'HELMET-001-M',
      retailPrice: 89.99,
      costPrice: 30,
    });

    const res = await request(app)
      .get('/api/v1/products/zero-mapped')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalZeroMapped).toBeGreaterThan(0);

    const found = res.body.data.find((p: any) => p._id.toString() === zeroProd._id.toString());
    expect(found).toBeDefined();
    expect(found.isZeroMapped).toBe(true);
    expect(found.masterSku).toBe('HELMET-001');
    expect(found.availableChannels.length).toBeGreaterThan(0);
  });

  it('should bulk map manually selected products using /api/v1/products/bulk-publish', async () => {
    const publishSpy = vi.spyOn(ShopifyService, 'publishProduct').mockResolvedValue({
      id: 55555555,
      title: 'Zero Mapped Helmet',
      variants: [{ id: 44444444, price: '89.99', sku: 'HELMET-001-M' }],
    });

    const zeroProd = await CanonicalProduct.findOne({
      organizationId: tenantId,
      masterSku: 'HELMET-001',
    });

    const res = await request(app)
      .post('/api/v1/products/bulk-publish')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [
          {
            productId: zeroProd?._id.toString(),
            channelConnectionIds: [connectionId],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.successfulCount).toBe(1);

    // Verify mapping was created and is active
    const mapping = await ProductMapping.findOne({
      canonicalProductId: zeroProd?._id,
      channelConnectionId: connectionId,
    });
    expect(mapping).toBeDefined();
    expect(mapping?.status).toBe(MappingStatus.MAPPED);

    publishSpy.mockRestore();
  });
});

