"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditController = void 0;
const models_1 = require("../../database/models");
class AuditController {
    static async list(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 30;
            const total = await models_1.AuditLog.countDocuments({ organizationId: req.tenantId });
            const logs = await models_1.AuditLog.find({ organizationId: req.tenantId })
                .populate('userId', 'email firstName lastName')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean();
            return res.json({
                success: true,
                data: logs,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list audit logs' },
            });
        }
    }
}
exports.AuditController = AuditController;
//# sourceMappingURL=audit.controller.js.map