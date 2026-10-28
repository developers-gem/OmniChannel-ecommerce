"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const teams_controller_1 = require("./teams.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const rbac_1 = require("../../middlewares/rbac");
const shared_1 = require("@multichannel/shared");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/', teams_controller_1.TeamsController.list);
router.put('/:memberId/role', (0, rbac_1.requireRole)(shared_1.UserRole.ADMIN), teams_controller_1.TeamsController.updateRole);
exports.default = router;
//# sourceMappingURL=teams.routes.js.map