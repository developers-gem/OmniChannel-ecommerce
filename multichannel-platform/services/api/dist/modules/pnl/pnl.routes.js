"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pnl_controller_1 = require("./pnl.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/summary', pnl_controller_1.PnLController.getSummary);
router.get('/products', pnl_controller_1.PnLController.getProductProfitability);
router.get('/channels', pnl_controller_1.PnLController.getChannelProfitability);
router.get('/trends', pnl_controller_1.PnLController.getTrends);
exports.default = router;
//# sourceMappingURL=pnl.routes.js.map