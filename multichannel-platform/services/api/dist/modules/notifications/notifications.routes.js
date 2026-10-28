"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notifications_controller_1 = require("./notifications.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/', notifications_controller_1.NotificationsController.list);
router.put('/:id/read', notifications_controller_1.NotificationsController.markAsRead);
router.put('/read-all', notifications_controller_1.NotificationsController.markAllAsRead);
router.delete('/clear-all', notifications_controller_1.NotificationsController.clearAll);
router.delete('/:id', notifications_controller_1.NotificationsController.delete);
exports.default = router;
//# sourceMappingURL=notifications.routes.js.map