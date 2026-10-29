import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';
import {
  ChannelConnection,
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  ChannelProduct,
  ProductMapping,
} from '../services/api/src/database/models';
import {
  ChannelType,
  ChannelStatus,
  ChannelProductStatus,
  SyncStatus,
  MappingStatus,
  MappingConfidence,
} from '@multichannel/shared';
import { EbayService } from '../services/api/src/services/ebay.service';
import { EbayIngestionService } from '../services/api/src/services/ebay-ingestion.service';
import axios from 'axios';

describe('Bidirectional Product Sync & Mapping for eBay Integration', () => {
  let authToken = '';
  let organizationId = '';
  let ebayConnection: any;
  let testProductId = '';
  let testVariantId = '';
  let testSku = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/multichannel_test_ebay_sync';
      await mongoose.connect(mongoUri);
    }

    // Register user & organization
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `ebay_sync_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'eBay',
        lastName: 'Engineer',
        organizationName: 'eBay Sync Enterprise',
      });

    authToken = res.body.data.tokens.accessToken;
    organizationId = res.body.data.user.organizationId;

    // Create an active eBay channel connection
    ebayConnection = await ChannelConnection.create({
      organizationId,
      channelType: ChannelType.EBAY,
      name: 'eBay US Test Store',
      status: ChannelStatus.ACTIVE,
      config: {
        storeDomain: 'api.sandbox.ebay.com',
        marketplaceId: 'EBAY_US',
      },
      credentials: {
        accessToken: 'dummy_encrypted_access_token',
      },
    });
  });

  afterAll(async () => {
    try {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    } catch (_) {}
  });

  describe('Step 1: Outbound Sync Pipeline & Premature Mapping Prevention', () => {
    beforeAll(async () => {
      testSku = `EBAY-OUT-${Date.now()}`;
      // Create canonical product in platform
      const prodRes = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Mechanical Gaming Keyboard RGB',
          masterSku: testSku,
          brand: 'KeyTech',
          category: 'Computer Accessories',
          defaultCostPrice: 35.0,
          defaultRetailPrice: 89.99,
          variants: [
            {
              sku: testSku,
              title: 'Standard Black Switch',
              costPrice: 35.0,
              retailPrice: 89.99,
              initialStock: 25,
            },
          ],
        });

      testProductId = prodRes.body.data._id;
      testVariantId = prodRes.body.data.variants[0]._id;
    });

    it('should NOT map the product or assume success if eBay rejects offer creation or publishing fails', async () => {
      // Mock EbayService.setInventoryItem to simulate eBay API rejection (e.g. policy error or missing listingId)
      const setInventoryItemSpy = vi.spyOn(EbayService, 'setInventoryItem').mockResolvedValueOnce({
        success: false,
        error: '[eBay Error 25002] A valid fulfillment policy must be specified.',
      });

      const res = await request(app)
        .post(`/api/v1/products/${testProductId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channelConnectionId: ebayConnection._id.toString(),
          forceRepublish: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('fulfillment policy');

      // Verify database state: ProductMapping must NOT exist or be MAPPED
      const mapping = await ProductMapping.findOne({
        organizationId,
        canonicalProductId: testProductId,
        channelConnectionId: ebayConnection._id,
        status: MappingStatus.MAPPED,
      });
      expect(mapping).toBeNull();

      // Verify ChannelProduct status is marked ERROR/INACTIVE rather than ACTIVE/SYNCED
      const channelProd = await ChannelProduct.findOne({
        organizationId,
        channelConnectionId: ebayConnection._id,
        sku: testSku,
      });
      expect(channelProd).toBeDefined();
      expect(channelProd?.status).toBe(ChannelProductStatus.ERROR);
      expect(channelProd?.syncStatus).toBe(SyncStatus.FAILED);

      setInventoryItemSpy.mockRestore();
    });

    it('should map the product ONLY after receiving confirmed success and real ItemID from eBay', async () => {
      const mockListingId = '110599182736';
      const mockOfferId = 'offer_99182736';

      // Mock EbayService.setInventoryItem to return confirmed success with listingId
      const setInventoryItemSpy = vi.spyOn(EbayService, 'setInventoryItem').mockResolvedValueOnce({
        success: true,
        listingId: mockListingId,
        offerId: mockOfferId,
      });

      const res = await request(app)
        .post(`/api/v1/products/${testProductId}/publish`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          channelConnectionId: ebayConnection._id.toString(),
          forceRepublish: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify that database record now confirmed as MAPPED with externalProductId = mockListingId
      const mapping = await ProductMapping.findOne({
        organizationId,
        canonicalProductId: testProductId,
        channelConnectionId: ebayConnection._id,
        status: MappingStatus.MAPPED,
      });
      expect(mapping).not.toBeNull();
      expect(mapping?.mappingConfidence).toBe(MappingConfidence.EXACT_SKU);

      const channelProd = await ChannelProduct.findById(mapping?.channelProductId);
      expect(channelProd).toBeDefined();
      expect(channelProd?.externalProductId).toBe(mockListingId);
      expect(channelProd?.status).toBe(ChannelProductStatus.ACTIVE);
      expect(channelProd?.syncStatus).toBe(SyncStatus.SYNCED);

      setInventoryItemSpy.mockRestore();
    });
  });

  describe('Step 2: Inbound Sync & Webhook Ingestion Service', () => {
    it('should safely ingest an eBay item created directly on eBay without a custom SKU', async () => {
      const ebayListingId = '120988776655';
      const result = await EbayIngestionService.ingestItem({
        organizationId,
        connection: ebayConnection,
        ebayItem: {
          listingId: ebayListingId,
          sku: '', // No seller SKU provided on eBay
          title: 'Direct eBay Wireless Mouse Ergonomic',
          description: 'High precision wireless optical mouse listed directly on eBay.',
          price: 29.99,
          quantity: 15,
          aspects: {
            Brand: ['LogiTech'],
            Type: ['Wireless Mouse'],
          },
        },
      });

      expect(result.canonicalProductId).toBeDefined();
      expect(result.channelProductId).toBeDefined();
      expect(result.sku).toBe(`EBAY-${ebayListingId}`);

      // Verify CanonicalProduct exists
      const canonical = await CanonicalProduct.findById(result.canonicalProductId);
      expect(canonical).toBeDefined();
      expect(canonical?.title).toBe('Direct eBay Wireless Mouse Ergonomic');
      expect(canonical?.defaultRetailPrice).toBe(29.99);

      // Verify InventoryItem tracks the stock
      const variant = await ProductVariant.findById(result.canonicalVariantId);
      expect(variant?.sku).toBe(`EBAY-${ebayListingId}`);

      const inv = await InventoryItem.findOne({ canonicalVariantId: variant?._id });
      expect(inv).toBeDefined();
      expect(inv?.trackedStock).toBe(15);
      expect(inv?.availableToAllocate).toBe(15);

      // Verify ProductMapping is active
      const mapping = await ProductMapping.findById(result.mappingId);
      expect(mapping?.status).toBe(MappingStatus.MAPPED);
    });

    it('should query updated database state reflecting incoming eBay products when refreshing platform UI', async () => {
      // Simulate frontend query to GET /api/v1/products (which runs on platform UI refresh)
      const res = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data;
      const ingested = items.find((p: any) => p.title === 'Direct eBay Wireless Mouse Ergonomic');
      expect(ingested).toBeDefined();
      expect(ingested.mappedCount).toBeGreaterThanOrEqual(1);
      expect(ingested.totalStock).toBe(15);
    });

    it('should process eBay webhook notification and trigger ingestion', async () => {
      const webhookListingId = '130445566778';
      const webhookPayload = {
        metadata: {
          topic: 'MARKETPLACE_ITEM_LISTED',
        },
        notification: {
          data: {
            listingId: webhookListingId,
            sku: 'EBAY-WH-001',
            title: 'Noise Cancelling Wireless Headphones',
            price: { value: '149.99', currency: 'USD' },
            quantity: 8,
          },
        },
      };

      const res = await request(app)
        .post(`/api/v1/webhooks/ebay/${ebayConnection._id}`)
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('processed');

      // Verify that the webhook ingested product into platform catalog
      const canonical = await CanonicalProduct.findOne({
        organizationId,
        masterSku: 'EBAY-WH-001',
      });
      expect(canonical).toBeDefined();
      expect(canonical?.title).toBe('Noise Cancelling Wireless Headphones');

      const mapping = await ProductMapping.findOne({
        organizationId,
        canonicalProductId: canonical?._id,
        status: MappingStatus.MAPPED,
      });
      expect(mapping).toBeDefined();
    });
  });

  describe('Step 3: Bidirectional Mapping Reconciliation & Status Check', () => {
    it('should enforce unique mapping constraints to prevent race conditions', async () => {
      const dummyVariantId = new mongoose.Types.ObjectId();
      const dummyProductId = new mongoose.Types.ObjectId();
      const dummyChProd1 = new mongoose.Types.ObjectId();
      const dummyChProd2 = new mongoose.Types.ObjectId();

      await ProductMapping.create({
        organizationId,
        canonicalProductId: dummyProductId,
        canonicalVariantId: dummyVariantId,
        channelConnectionId: ebayConnection._id,
        channelProductId: dummyChProd1,
        channelType: ChannelType.EBAY,
        mappingConfidence: MappingConfidence.EXACT_SKU,
        status: MappingStatus.MAPPED,
      });

      // Attempting to create a duplicate active MAPPED record for same variant & channel should violate unique constraint
      let duplicateError: any = null;
      try {
        await ProductMapping.create({
          organizationId,
          canonicalProductId: dummyProductId,
          canonicalVariantId: dummyVariantId,
          channelConnectionId: ebayConnection._id,
          channelProductId: dummyChProd2,
          channelType: ChannelType.EBAY,
          mappingConfidence: MappingConfidence.EXACT_SKU,
          status: MappingStatus.MAPPED,
        });
      } catch (err: any) {
        duplicateError = err;
      }

      expect(duplicateError).not.toBeNull();
      expect(duplicateError.code).toBe(11000); // MongoDB Duplicate Key Error
    });

    it('should detect and resolve discrepancies via reconciliation check when an item was deleted on eBay', async () => {
      // Create a mapped item in platform that no longer exists on eBay
      const ghostSku = `GHOST-SKU-${Date.now()}`;
      const ghostListingId = '999888777666';

      const chProd = await ChannelProduct.create({
        organizationId,
        channelConnectionId: ebayConnection._id,
        channelType: ChannelType.EBAY,
        externalProductId: ghostListingId,
        externalVariantId: ghostSku,
        title: 'Ghost Product Disappeared from eBay',
        sku: ghostSku,
        price: 49.99,
        inventoryQuantity: 5,
        status: ChannelProductStatus.ACTIVE,
        syncStatus: SyncStatus.SYNCED,
      });

      const mapping = await ProductMapping.create({
        organizationId,
        canonicalProductId: testProductId,
        canonicalVariantId: testVariantId,
        channelConnectionId: ebayConnection._id,
        channelProductId: chProd._id,
        channelType: ChannelType.EBAY,
        status: MappingStatus.MAPPED,
      });

      // Mock EbayService credentials and client to return 404 for ghostSku
      const mockGetCredentials = vi.spyOn(EbayService, 'getValidCredentials').mockResolvedValue({
        host: 'api.sandbox.ebay.com',
        token: 'mock_token',
        isSandbox: true,
      });

      const mockGetClient = vi.spyOn(EbayService, 'getClient').mockReturnValue({
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes(ghostSku)) {
            const notFoundErr: any = new Error('Request failed with status code 404');
            notFoundErr.response = { status: 404, data: { errors: [{ errorId: 25001, message: 'Item not found' }] } };
            return Promise.reject(notFoundErr);
          }
          return Promise.resolve({ data: { inventoryItems: [] } });
        }),
      } as any);

      // Run reconciliation check
      const reconResult = await EbayService.reconcileEbaySync(organizationId, ebayConnection);

      expect(reconResult.discrepanciesResolvedCount).toBeGreaterThanOrEqual(1);
      expect(reconResult.missingOnEbayCount).toBeGreaterThanOrEqual(1);

      // Verify mapping was automatically updated to UNMAPPED with explanation
      const updatedMapping = await ProductMapping.findById(mapping._id);
      expect(updatedMapping?.status).toBe(MappingStatus.UNMAPPED);
      expect(updatedMapping?.unmappedReason).toContain('does not exist on eBay');

      // Verify channel product was updated to ENDED/FAILED
      const updatedChProd = await ChannelProduct.findById(chProd._id);
      expect(updatedChProd?.status).toBe(ChannelProductStatus.ENDED);
      expect(updatedChProd?.syncStatus).toBe(SyncStatus.FAILED);

      mockGetCredentials.mockRestore();
      mockGetClient.mockRestore();
    });

    it('should resolve correct leaf category and aspects for tableware items like Teac Cup without ink specific requirements', () => {
      const categoryId = EbayService.resolveCategoryId('Teac Cup (MKSHT5500)');
      expect(categoryId).toBe('261672'); // Mugs / Cups leaf category

      const aspects = EbayService.resolveAspects('Teac Cup (MKSHT5500)', 'Generic', undefined, 'Kitchen');
      expect(aspects['Type']).toBeDefined();
      expect(aspects['Type']).toContain('Tea Cup');
      expect(aspects['Material']).toContain('Ceramic');
      expect(aspects['Compatible Brand']).toBeUndefined();
    });

    it('should resolve correct leaf category and aspects for headphones without non-leaf category error', () => {
      const categoryId = EbayService.resolveCategoryId('Wireless Active Noise-Cancelling Headphones (MMKN236)');
      expect(categoryId).toBe('112529'); // Consumer Electronics > Portable Audio & Headphones > Headphones (Leaf Category)

      const aspects = EbayService.resolveAspects('Wireless Active Noise-Cancelling Headphones (MMKN236)', 'AcoustiQ', undefined, 'Electronics / Audio');
      expect(aspects['Type']).toBeDefined();
      expect(aspects['Type']).toContain('Ear-Cup (Over the Ear)');
      expect(aspects['Connectivity']).toContain('Bluetooth');
      expect(aspects['Model']).toContain('Universal');
      expect(aspects['Brand']).toContain('AcoustiQ');
      expect(aspects['Compatible Brand']).toBeUndefined();
    });

    it('should resolve correct leaf category and required aspects (Form Factor) for smartphones', () => {
      const categoryId = EbayService.resolveCategoryId('samsumng smarthphone (563MKL85)');
      expect(categoryId).toBe('9355'); // Cell Phones & Smartphones (Leaf Category)

      const aspects = EbayService.resolveAspects('samsumng smarthphone (563MKL85)', 'Samsung', undefined, 'Electronics');
      expect(aspects['Form Factor']).toBeDefined();
      expect(aspects['Form Factor']).toContain('Bar');
      expect(aspects['Storage Capacity']).toBeDefined();
      expect(aspects['Network']).toContain('Unlocked');
      expect(aspects['Operating System']).toBeDefined();
    });
  });
});

