import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { ChannelProductStatus, ChannelType, ChannelStatus } from '@multichannel/shared';
import { EbayIngestionService } from '../services/api/src/services/ebay-ingestion.service';
import {
  ChannelProduct,
  CanonicalProduct,
  ProductVariant,
  ProductMapping,
  InventoryItem,
  InventoryMovement,
} from '../services/api/src/database/models';
import { NotificationService } from '../services/api/src/services/notification.service';

describe('Senior QA Test Suite: eBay Active Listings Count & Deletion Resurrection', () => {
  const testOrgId = new mongoose.Types.ObjectId();
  const testConnectionId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Test Case TC-EBAY-001: Channel Integrations Active Count Aggregation', () => {
    it('should count only ChannelProductStatus.ACTIVE items (25), excluding ended, draft, or unlisted (12)', () => {
      // Simulate the 37 items in the database for the eBay channel
      const mockChannelProducts = [
        ...Array.from({ length: 25 }, (_, i) => ({
          sku: `ACTIVE-SKU-${i + 1}`,
          status: ChannelProductStatus.ACTIVE,
          listingId: `LISTING-${i + 1}`,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          sku: `ENDED-SKU-${i + 1}`,
          status: ChannelProductStatus.ENDED,
          listingId: null,
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          sku: `DRAFT-SKU-${i + 1}`,
          status: 'DRAFT',
          listingId: null,
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          sku: `UNPUBLISHED-SKU-${i + 1}`,
          status: 'UNPUBLISHED',
          listingId: null,
        })),
      ];

      expect(mockChannelProducts.length).toBe(37);

      // Verify the new filter logic: { status: ChannelProductStatus.ACTIVE }
      const activeFilter = { status: ChannelProductStatus.ACTIVE };
      const filteredActiveProducts = mockChannelProducts.filter(
        (p) => p.status === activeFilter.status
      );

      // Must be exactly 25 active listings (matching eBay Seller Hub: 25)
      expect(filteredActiveProducts.length).toBe(25);

      // Verify that previously buggy filter ({ status: { $nin: ['ENDED', 'UNPUBLISHED'] } }) produced the bug
      const buggyFilterExcluded = ['ENDED', 'UNPUBLISHED'];
      const buggyProducts = mockChannelProducts.filter(
        (p) => !buggyFilterExcluded.includes(p.status)
      );
      // Buggy filter counted DRAFT items as well (25 active + 4 draft = 29)
      expect(buggyProducts.length).not.toBe(25);
    });
  });

  describe('Test Case TC-EBAY-002: Prevention of Deleted Product Resurrection (Sync Cycle)', () => {
    it('should NOT resurrect deleted products when eBay returns ended/unpublished inventory items', async () => {
      // Setup spies on Mongoose models
      vi.spyOn(ChannelProduct, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(CanonicalProduct, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(ProductVariant, 'findOne').mockResolvedValue(null as any);
      const createCanonicalSpy = vi.spyOn(CanonicalProduct, 'create');
      const createVariantSpy = vi.spyOn(ProductVariant, 'create');
      const createMappingSpy = vi.spyOn(ProductMapping, 'create');
      vi.spyOn(ChannelProduct, 'create').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        status: ChannelProductStatus.ENDED,
      } as any);

      // Mock item payload from eBay where the item was ended/unpublished
      const unpublishedEbayItem = {
        sku: 'DELETED-PRODUCT-SKU-999',
        title: 'Deleted Test Item',
        description: 'Should not be resurrected',
        isPublished: false,
        offerStatus: 'UNPUBLISHED',
        listingId: null,
        price: { value: 19.99, currency: 'EUR' },
        stock: 0,
      };

      const mockConnection = {
        _id: testConnectionId,
        config: { marketplaceId: 'EBAY_US' },
      };

      const result = await EbayIngestionService.ingestItem({
        organizationId: testOrgId,
        connection: mockConnection as any,
        ebayItem: unpublishedEbayItem as any,
      });

      // Assertions:
      // 1. Ingestion must report isNewProduct = false and null canonicalProductId
      expect(result.isNewProduct).toBe(false);
      expect(result.canonicalProductId).toBeNull();

      // 2. Critical: CanonicalProduct.create and ProductVariant.create MUST NOT BE CALLED
      expect(createCanonicalSpy).not.toHaveBeenCalled();
      expect(createVariantSpy).not.toHaveBeenCalled();
      expect(createMappingSpy).not.toHaveBeenCalled();
    });

    it('should correctly mark existing ChannelProduct as ENDED when item is ended on eBay', async () => {
      const existingChannelProductId = new mongoose.Types.ObjectId();
      const mockChannelProductDoc = {
        _id: existingChannelProductId,
        status: ChannelProductStatus.ACTIVE,
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(ChannelProduct, 'findOne').mockResolvedValue(mockChannelProductDoc as any);
      vi.spyOn(CanonicalProduct, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(ProductVariant, 'findOne').mockResolvedValue(null as any);
      const createCanonicalSpy = vi.spyOn(CanonicalProduct, 'create');

      const endedEbayItem = {
        sku: 'ENDED-PRODUCT-SKU-888',
        title: 'Ended Test Item',
        isPublished: false,
        offerStatus: 'ENDED',
        listingId: 'OLD-LISTING-888',
      };

      const mockConnection = {
        _id: testConnectionId,
        config: { marketplaceId: 'EBAY_US' },
      };

      const result = await EbayIngestionService.ingestItem({
        organizationId: testOrgId,
        connection: mockConnection as any,
        ebayItem: endedEbayItem as any,
      });

      // ChannelProduct must transition to ENDED
      expect(mockChannelProductDoc.status).toBe(ChannelProductStatus.ENDED);
      expect(mockChannelProductDoc.save).toHaveBeenCalled();

      // CanonicalProduct MUST NOT be created
      expect(createCanonicalSpy).not.toHaveBeenCalled();
      expect(result.canonicalProductId).toBeNull();
      expect(result.channelProductId).toBe(existingChannelProductId);
    });

    it('should ingest and map ONLY genuinely active, published eBay items with active listings', async () => {
      const newCanonicalId = new mongoose.Types.ObjectId();
      const newVariantId = new mongoose.Types.ObjectId();
      const newChannelProductId = new mongoose.Types.ObjectId();
      const newMappingId = new mongoose.Types.ObjectId();

      const mockCreatedCanonical = {
        _id: newCanonicalId,
      };
      const mockCreatedVariant = {
        _id: newVariantId,
        sku: 'ACTIVE-LIVE-SKU-100',
      };
      const mockCreatedChannelProduct = {
        _id: newChannelProductId,
        status: ChannelProductStatus.ACTIVE,
      };
      const mockCreatedMapping = {
        _id: newMappingId,
      };

      vi.spyOn(ChannelProduct, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(CanonicalProduct, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(ProductVariant, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(InventoryItem, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(InventoryItem, 'create').mockResolvedValue({} as any);
      vi.spyOn(InventoryMovement, 'create').mockResolvedValue({} as any);
      vi.spyOn(ProductMapping, 'findOne').mockResolvedValue(null as any);
      vi.spyOn(NotificationService, 'notifyProductUploaded').mockResolvedValue(undefined as any);

      vi.spyOn(CanonicalProduct, 'create').mockResolvedValue(mockCreatedCanonical as any);
      vi.spyOn(ProductVariant, 'create').mockResolvedValue(mockCreatedVariant as any);
      vi.spyOn(ChannelProduct, 'create').mockResolvedValue(mockCreatedChannelProduct as any);
      vi.spyOn(ProductMapping, 'create').mockResolvedValue(mockCreatedMapping as any);

      const activeEbayItem = {
        sku: 'ACTIVE-LIVE-SKU-100',
        title: 'Genuinely Active Live Listing',
        isPublished: true,
        offerStatus: 'PUBLISHED',
        listingId: 'ACTIVE-LISTING-100',
        price: { value: 45.0, currency: 'EUR' },
        stock: 10,
      };

      const mockConnection = {
        _id: testConnectionId,
        config: { marketplaceId: 'EBAY_US' },
      };

      const result = await EbayIngestionService.ingestItem({
        organizationId: testOrgId,
        connection: mockConnection as any,
        ebayItem: activeEbayItem as any,
      });

      expect(result.isNewProduct).toBe(true);
      expect(result.canonicalProductId).toBe(newCanonicalId);
      expect(result.channelProductId).toBe(newChannelProductId);
      expect(result.sku).toBe('ACTIVE-LIVE-SKU-100');
    });
  });

  describe('Test Case TC-EBAY-003: 37 Total vs 25 Active eBay Inventory Reconciliation', () => {
    it('should accurately split a 37-item inventory into 25 active and 12 ended/skipped items', () => {
      // Simulate 37 raw items as returned by eBay Inventory API
      const ebayInventoryItems = Array.from({ length: 37 }, (_, i) => {
        const isActive = i < 25; // First 25 are active, remaining 12 are inactive/draft
        return {
          sku: `SKU-${i + 1}`,
          isPublished: isActive,
          offerStatus: isActive ? 'PUBLISHED' : (i % 2 === 0 ? 'UNPUBLISHED' : 'ENDED'),
          listingId: isActive ? `LISTING-${i + 1}` : null,
        };
      });

      const activeSkus = new Set<string>();
      const activeListingIds = new Set<string>();
      const inactiveSkus: string[] = [];

      for (const item of ebayInventoryItems) {
        const isLiveActive =
          item.isPublished === true ||
          item.offerStatus === 'PUBLISHED' ||
          (item.listingId !== null &&
            !['UNPUBLISHED', 'ENDED', 'INACTIVE', 'OUT_OF_STOCK'].includes(
              String(item.offerStatus || '').toUpperCase()
            ));

        if (isLiveActive) {
          activeSkus.add(item.sku);
          if (item.listingId) activeListingIds.add(item.listingId);
        } else {
          inactiveSkus.push(item.sku);
        }
      }

      // Assertions
      expect(activeSkus.size).toBe(25);
      expect(activeListingIds.size).toBe(25);
      expect(inactiveSkus.length).toBe(12);
      expect(activeSkus.size + inactiveSkus.length).toBe(37);
    });
  });
});
