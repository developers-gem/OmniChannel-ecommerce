"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const csv_controller_1 = require("./csv.controller");
const auth_1 = require("../../middlewares/auth");
const tenant_1 = require("../../middlewares/tenant");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(tenant_1.enforceTenantIsolation);
router.post('/preview', csv_controller_1.CsvController.preview);
router.post('/import', csv_controller_1.CsvController.import);
router.get('/jobs', csv_controller_1.CsvController.getJobs);
router.get('/export', csv_controller_1.CsvController.export);
exports.default = router;
//# sourceMappingURL=csv.routes.js.map