import { Router } from 'express';
import { WebhooksController } from './webhooks.controller';

const router = Router();

// Public webhook ingress endpoints (authenticated via HMAC signature / provider headers)
router.post('/shopify/:connectionId', WebhooksController.handleShopify);
router.post('/ebay/:connectionId', WebhooksController.handleEbay);
router.post('/custom/:connectionId', WebhooksController.handleCustom);

export default router;
