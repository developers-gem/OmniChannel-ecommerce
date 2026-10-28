"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const orders_controller_1 = require("./orders.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/', orders_controller_1.OrdersController.list);
router.get('/:id', orders_controller_1.OrdersController.getById);
router.post('/:id/fulfill', orders_controller_1.OrdersController.fulfill);
router.post('/:id/cancel', orders_controller_1.OrdersController.cancel);
exports.default = router;
//# sourceMappingURL=orders.routes.js.map