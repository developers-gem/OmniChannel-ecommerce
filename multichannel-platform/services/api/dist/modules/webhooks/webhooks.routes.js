"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhooks_controller_1 = require("./webhooks.controller");
const router = (0, express_1.Router)();
// Public webhook ingress endpoints (authenticated via HMAC signature / provider headers)
router.post('/shopify/:connectionId', webhooks_controller_1.WebhooksController.handleShopify);
router.post('/ebay/:connectionId', webhooks_controller_1.WebhooksController.handleEbay);
router.post('/custom/:connectionId', webhooks_controller_1.WebhooksController.handleCustom);
exports.default = router;
//# sourceMappingURL=webhooks.routes.js.map