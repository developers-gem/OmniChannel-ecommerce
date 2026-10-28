"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("./dashboard.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/metrics', dashboard_controller_1.DashboardController.getMetrics);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map