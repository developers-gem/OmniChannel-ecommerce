import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';
import {
  ChannelConnection,
  CanonicalProduct,
  ProductVariant,
  InventoryItem,
  Order,
  OrderLine,
  ChannelProduct,
  ProductMapping,
  InventoryMovement,
} from '../services/api/src/database/models';
import {
  ChannelType,
  ChannelStatus,
  MappingStatus,
  OrderFulfillmentStatus,
  InventoryChangeType,
} from '@multichannel/shared';

describe('Multi-Store Metrics & Order Inventory Lifecycle Engine', () => {
  let authToken = '';
  let tenantId = '';
  let shopifyConn1: any;
  let shopifyConn2: any;
  let ebayConn1: any;
  let canonicalProd: any;
  let variant: any;
  let invItem: any;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_lifecycle');
    }

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `lifecycle_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Lifecycle',
        lastName: 'Tester',
        organizationName: 'Global MultiStore Corp',
      });

    authToken = res.body.data.tokens.accessToken;
    tenantId = res.body.data.organization?.id || res.body.data.organization?._id || res.body.data.user?.organizationId;

    // Create 2 Shopify stores and 1 eBay store
    shopifyConn1 = await ChannelConnection.create({
      organizationId: tenantId,
      channelType: ChannelType.SHOPIFY,
      name: 'Shopify US Store',
      status: ChannelStatus.ACTIVE,
      config: { storeDomain: 'us-store.myshopify.com' },
    });

    shopifyConn2 = await ChannelConnection.create({
      organizationId: tenantId,
      channelType: ChannelType.SHOPIFY,
      name: 'Shopify EU Store',
      status: ChannelStatus.ACTIVE,
      config: { storeDomain: 'eu-store.myshopify.com' },
    });

    ebayConn1 = await ChannelConnection.create({
      organizationId: tenantId,
      channelType: ChannelType.EBAY,
      name: 'eBay Global Outlet',
      status: ChannelStatus.ACTIVE,
      config: { storeDomain: 'api.sandbox.ebay.com' },
    });

    // Create canonical product and variant
    canonicalProd = await CanonicalProduct.create({
      organizationId: tenantId,
      title: 'Precision Mechanical Keyboard',
      masterSku: 'KB-MECH-001',
      brand: 'Keycraft',
      category: 'Electronics',
    });

    variant = await ProductVariant.create({
      organizationId: tenantId,
      canonicalProductId: canonicalProd._id,
      sku: 'KB-MECH-001-RGB',
      title: 'Precision Mechanical Keyboard - RGB',
      price: 129.99,
      costPrice: 45.0,
    });

    invItem = await InventoryItem.create({
      organizationId: tenantId,
      canonicalVariantId: variant._id,
      sku: 'KB-MECH-001-RGB',
      trackedStock: 50,
      reservedStock: 0,
      safetyStock: 5,
      availableToAllocate: 45,
      lowStockThreshold: 10,
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should accurately aggregate multi-store metrics and incomplete mappings in dashboard', async () => {
    // Map product only to shopifyConn1 (leaving shopifyConn2 and ebayConn1 unmapped -> incomplete)
    const chProd1 = await ChannelProduct.create({
      organizationId: tenantId,
      channelConnectionId: shopifyConn1._id,
      channelType: ChannelType.SHOPIFY,
      externalProductId: 'sh_prod_101',
      title: 'Precision Mechanical Keyboard (Shopify)',
      sku: 'KB-MECH-001-RGB',
    });

    await ProductMapping.create({
      organizationId: tenantId,
      canonicalProductId: canonicalProd._id,
      canonicalVariantId: variant._id,
      channelConnectionId: shopifyConn1._id,
      channelProductId: chProd1._id,
      channelType: ChannelType.SHOPIFY,
      status: MappingStatus.MAPPED,
    });

    const res = await request(app)
      .get('/api/v1/dashboard/metrics')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const catalog = res.body.data.catalog;
    expect(catalog.totalProducts).toBe(1);
    expect(catalog.shopifyProducts).toBe(1);
    expect(catalog.ebayProducts).toBe(0);
    // Since there are 3 active channels and product is only mapped to 1, incompleteMappedCount must be 1
    expect(catalog.incompleteMappedCount).toBe(1);
    expect(catalog.zeroMappedCount).toBe(0);
  });

  it('should reserve inventory and assign canonicalVariantId when webhook order is ingested', async () => {
    const orderPayload = {
      id: 9918237,
      order_number: 1099,
      name: '#1099',
      total_price: '129.99',
      financial_status: 'paid',
      created_at: new Date().toISOString(),
      customer: {
        first_name: 'Alice',
        last_name: 'Wonder',
        email: 'alice@example.com',
      },
      line_items: [
        {
          id: 88123,
          sku: 'KB-MECH-001-RGB',
          title: 'Precision Mechanical Keyboard - RGB',
          quantity: 2,
          price: '129.99',
        },
      ],
    };

    const webhookRes = await request(app)
      .post(`/api/v1/webhooks/shopify/${shopifyConn1._id}`)
      .set('x-shopify-topic', 'orders/create')
      .send(orderPayload);

    expect(webhookRes.status).toBe(200);

    // Verify order was created with line items linked to canonical variant and unit cost
    const createdOrder = await Order.findOne({
      organizationId: tenantId,
      externalOrderId: '9918237',
    });
    expect(createdOrder).toBeDefined();

    const orderLine = await OrderLine.findOne({ orderId: createdOrder!._id });
    expect(orderLine).toBeDefined();
    expect(orderLine!.canonicalVariantId?.toString()).toBe(variant._id.toString());
    expect(orderLine!.unitCost).toBe(45.0);

    // Verify inventory reserved: 2 units
    const updatedInv = await InventoryItem.findOne({ canonicalVariantId: variant._id });
    expect(updatedInv!.reservedStock).toBe(2);
    expect(updatedInv!.availableToAllocate).toBe(50 - 2 - 5); // 43

    // Verify movement logged
    const movement = await InventoryMovement.findOne({
      canonicalVariantId: variant._id,
      changeType: InventoryChangeType.ORDER_RESERVED,
    });
    expect(movement).toBeDefined();
    expect(movement!.quantityChanged).toBe(2);
  });

  it('should deduct tracked stock and release reserved stock upon fulfillment', async () => {
    const order = await Order.findOne({
      organizationId: tenantId,
      externalOrderId: '9918237',
    });

    const fulfillRes = await request(app)
      .post(`/api/v1/orders/${order!._id}/fulfill`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        trackingCompany: 'FedEx',
        trackingNumber: 'FX123456789US',
        trackingUrl: 'https://fedex.com/track/FX123456789US',
      });

    expect(fulfillRes.status).toBe(200);
    expect(fulfillRes.body.success).toBe(true);
    expect(fulfillRes.body.data.order.fulfillmentStatus).toBe(OrderFulfillmentStatus.FULFILLED);

    // Verify inventory after fulfillment:
    // trackedStock should decrease by 2 (50 -> 48)
    // reservedStock should decrease by 2 (2 -> 0)
    const invAfterFulfill = await InventoryItem.findOne({ canonicalVariantId: variant._id });
    expect(invAfterFulfill!.trackedStock).toBe(48);
    expect(invAfterFulfill!.reservedStock).toBe(0);
    expect(invAfterFulfill!.availableToAllocate).toBe(48 - 0 - 5); // 43

    const fulfillMovement = await InventoryMovement.findOne({
      canonicalVariantId: variant._id,
      changeType: InventoryChangeType.ORDER_FULFILLED,
    });
    expect(fulfillMovement).toBeDefined();
    expect(fulfillMovement!.quantityChanged).toBe(-2);
  });

  it('should restock trackedStock when a fulfilled order is cancelled', async () => {
    const order = await Order.findOne({
      organizationId: tenantId,
      externalOrderId: '9918237',
    });

    const cancelRes = await request(app)
      .post(`/api/v1/orders/${order!._id}/cancel`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ reason: 'Customer return and cancellation' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.fulfillmentStatus).toBe(OrderFulfillmentStatus.CANCELLED);

    // Verify inventory restocked:
    // trackedStock was 48, restored by +2 back to 50
    const invAfterCancel = await InventoryItem.findOne({ canonicalVariantId: variant._id });
    expect(invAfterCancel!.trackedStock).toBe(50);
    expect(invAfterCancel!.reservedStock).toBe(0);
    expect(invAfterCancel!.availableToAllocate).toBe(45);

    const restockMovement = await InventoryMovement.findOne({
      canonicalVariantId: variant._id,
      changeType: InventoryChangeType.RETURN_RESTOCK,
    });
    expect(restockMovement).toBeDefined();
    expect(restockMovement!.quantityChanged).toBe(2);
  });
});
