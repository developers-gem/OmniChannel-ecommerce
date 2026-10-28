"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const channels_controller_1 = require("./channels.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const validate_1 = require("../../middlewares/validate");
const shared_1 = require("@multichannel/shared");
const router = (0, express_1.Router)();
// Public callback endpoint for OAuth redirection (eBay and Shopify redirect user browser here)
router.get('/ebay/callback', channels_controller_1.ChannelsController.handleEbayCallback);
router.get('/shopify/callback', channels_controller_1.ChannelsController.handleShopifyCallback);
// Authenticated and tenant-isolated routes
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/ebay/auth-url', channels_controller_1.ChannelsController.getEbayAuthUrl);
router.post('/ebay/exchange-code', channels_controller_1.ChannelsController.exchangeEbayCode);
router.get('/shopify/auth-url', channels_controller_1.ChannelsController.getShopifyAuthUrl);
router.post('/shopify/exchange-code', channels_controller_1.ChannelsController.exchangeShopifyCode);
router.get('/', channels_controller_1.ChannelsController.list);
router.post('/', (0, validate_1.validate)(shared_1.CreateChannelConnectionSchema), channels_controller_1.ChannelsController.create);
router.get('/:id', channels_controller_1.ChannelsController.getById);
router.post('/:id/test', channels_controller_1.ChannelsController.testConnection);
router.delete('/:id', channels_controller_1.ChannelsController.delete);
exports.default = router;
//# sourceMappingURL=channels.routes.js.map