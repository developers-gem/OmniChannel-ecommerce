"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamsController = void 0;
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
class TeamsController {
    static async list(req, res) {
        try {
            const members = await models_1.Membership.find({
                organizationId: req.tenantId,
            })
                .populate('userId', 'email firstName lastName isActive lastLoginAt')
                .lean();
            return res.json({
                success: true,
                data: members,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list team members' },
            });
        }
    }
    static async updateRole(req, res) {
        try {
            const { memberId } = req.params;
            const { role } = req.body;
            if (!Object.values(shared_1.UserRole).includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Invalid role provided' },
                });
            }
            const membership = await models_1.Membership.findOneAndUpdate({ _id: memberId, organizationId: req.tenantId }, { $set: { role } }, { new: true });
            if (!membership) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Member not found' },
                });
            }
            return res.json({
                success: true,
                data: membership,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to update member role' },
            });
        }
    }
}
exports.TeamsController = TeamsController;
//# sourceMappingURL=teams.controller.js.map