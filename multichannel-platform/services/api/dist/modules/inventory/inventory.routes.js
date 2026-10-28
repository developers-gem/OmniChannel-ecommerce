"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inventory_controller_1 = require("./inventory.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const validate_1 = require("../../middlewares/validate");
const shared_1 = require("@multichannel/shared");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.get('/', inventory_controller_1.InventoryController.list);
router.get('/movements', inventory_controller_1.InventoryController.getMovements);
router.post('/:variantId/adjust', (0, validate_1.validate)(shared_1.UpdateInventorySchema), inventory_controller_1.InventoryController.adjust);
router.post('/:variantId/sync-channels', inventory_controller_1.InventoryController.syncChannels);
router.put('/:variantId/allocations', inventory_controller_1.InventoryController.setAllocation);
exports.default = router;
//# sourceMappingURL=inventory.routes.js.map