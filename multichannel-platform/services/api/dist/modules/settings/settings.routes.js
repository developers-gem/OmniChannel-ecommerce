"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settings_controller_1 = require("./settings.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const rbac_1 = require("../../middlewares/rbac");
const shared_1 = require("@multichannel/shared");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/', settings_controller_1.SettingsController.getSettings);
router.put('/', (0, rbac_1.requireRole)(shared_1.UserRole.ADMIN), settings_controller_1.SettingsController.updateSettings);
exports.default = router;
//# sourceMappingURL=settings.routes.js.map