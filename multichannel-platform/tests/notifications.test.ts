import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../services/api/src/index';
import { NotificationService } from '../services/api/src/services/notification.service';
import { ChannelType, NotificationCategory, NotificationSeverity } from '@multichannel/shared';

describe('Notifications System & Channel Alert Engine', () => {
  let token: string;
  let organizationId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/multichannel_test_notifications');
    }

    // Register a test organization
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `notif_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        firstName: 'Notif',
        lastName: 'Tester',
        organizationName: 'Notifications Corp',
      });

    token = regRes.body.data.tokens.accessToken;
    organizationId = regRes.body.data.organization.id;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('should create notifications when a product is uploaded to Shopify and eBay', async () => {
    // 1. Upload to Shopify
    const shopifyNotif = await NotificationService.notifyProductUploaded({
      organizationId,
      productTitle: 'Vintage Leather Jacket',
      channelName: 'Downtown Shopify Store',
      channelType: ChannelType.SHOPIFY,
      sku: 'SKU-JACKET-01',
    });

    expect(shopifyNotif).toBeDefined();
    expect(shopifyNotif?.title).toContain('Product Uploaded to Downtown Shopify Store');
    expect(shopifyNotif?.channelType).toBe(ChannelType.SHOPIFY);
    expect(shopifyNotif?.severity).toBe(NotificationSeverity.SUCCESS);

    // 2. Upload to eBay
    const ebayNotif = await NotificationService.notifyProductUploaded({
      organizationId,
      productTitle: 'Retro Wireless Headphones',
      channelName: 'Global eBay Outlet',
      channelType: ChannelType.EBAY,
      sku: 'SKU-HEADPHONE-02',
    });

    expect(ebayNotif).toBeDefined();
    expect(ebayNotif?.title).toContain('Product Uploaded to Global eBay Outlet');
    expect(ebayNotif?.channelType).toBe(ChannelType.EBAY);
    expect(ebayNotif?.severity).toBe(NotificationSeverity.SUCCESS);
  });

  it('should create notifications when products or listings are modified or updated', async () => {
    const modNotif = await NotificationService.notifyProductModified({
      organizationId,
      productTitle: 'Vintage Leather Jacket',
      source: 'Shopify Store (Downtown)',
      channelType: ChannelType.SHOPIFY,
      changesSummary: 'Price updated to $149.99 and stock reduced by 2.',
    });

    expect(modNotif).toBeDefined();
    expect(modNotif?.title).toBe('Product Modified: Vintage Leather Jacket');
    expect(modNotif?.message).toContain('Price updated to $149.99');
    expect(modNotif?.channelType).toBe(ChannelType.SHOPIFY);
  });

  it('should list all notifications and support channelType filtering via API', async () => {
    // List all
    const allRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(allRes.status).toBe(200);
    expect(allRes.body.success).toBe(true);
    expect(allRes.body.data.notifications.length).toBeGreaterThanOrEqual(3);
    expect(allRes.body.data.unreadCount).toBeGreaterThanOrEqual(3);

    // Filter by Shopify
    const shopifyRes = await request(app)
      .get('/api/v1/notifications?channelType=SHOPIFY')
      .set('Authorization', `Bearer ${token}`);

    expect(shopifyRes.status).toBe(200);
    expect(shopifyRes.body.data.notifications.every((n: any) => n.channelType === 'SHOPIFY')).toBe(true);

    // Filter by eBay
    const ebayRes = await request(app)
      .get('/api/v1/notifications?channelType=EBAY')
      .set('Authorization', `Bearer ${token}`);

    expect(ebayRes.status).toBe(200);
    expect(ebayRes.body.data.notifications.every((n: any) => n.channelType === 'EBAY')).toBe(true);
  });

  it('should mark an individual notification as read and mark all as read', async () => {
    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    const firstNotifId = listRes.body.data.notifications[0]._id;

    // Mark single as read
    const markOneRes = await request(app)
      .put(`/api/v1/notifications/${firstNotifId}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(markOneRes.status).toBe(200);
    expect(markOneRes.body.success).toBe(true);

    // Mark all as read
    const markAllRes = await request(app)
      .put('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(markAllRes.status).toBe(200);
    expect(markAllRes.body.success).toBe(true);

    const afterListRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(afterListRes.body.data.unreadCount).toBe(0);
    expect(afterListRes.body.data.notifications.every((n: any) => n.isRead === true)).toBe(true);
  });

  it('should delete a single notification and clear all read notifications', async () => {
    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    const initialTotal = listRes.body.data.totalCount;
    const targetId = listRes.body.data.notifications[0]._id;

    // Delete single notification
    const delRes = await request(app)
      .delete(`/api/v1/notifications/${targetId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(200);

    // Clear all read notifications
    const clearRes = await request(app)
      .delete('/api/v1/notifications/clear-all')
      .set('Authorization', `Bearer ${token}`);

    expect(clearRes.status).toBe(200);

    const afterClearRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(afterClearRes.body.data.notifications.length).toBe(0);
  });
});
