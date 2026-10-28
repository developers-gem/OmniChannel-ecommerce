"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceTenantIsolation = enforceTenantIsolation;
const mongoose_1 = __importDefault(require("mongoose"));
function enforceTenantIsolation(req, res, next) {
    if (!req.tenantId || !mongoose_1.default.Types.ObjectId.isValid(req.tenantId)) {
        return res.status(403).json({
            success: false,
            error: {
                message: 'Valid organization context required',
                code: 'TENANT_REQUIRED',
            },
        });
    }
    next();
}
//# sourceMappingURL=tenant.js.map