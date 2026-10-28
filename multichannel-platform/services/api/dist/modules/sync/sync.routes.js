"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sync_controller_1 = require("./sync.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/jobs', sync_controller_1.SyncController.listJobs);
router.post('/trigger', sync_controller_1.SyncController.triggerSync);
router.post('/import-to-canonical', sync_controller_1.SyncController.importToCanonical);
router.post('/jobs/:id/retry', sync_controller_1.SyncController.retryJob);
exports.default = router;
//# sourceMappingURL=sync.routes.js.map