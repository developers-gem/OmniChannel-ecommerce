"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const shared_1 = require("@multichannel/shared");
const roleHierarchy = {
    [shared_1.UserRole.OWNER]: 5,
    [shared_1.UserRole.ADMIN]: 4,
    [shared_1.UserRole.MANAGER]: 3,
    [shared_1.UserRole.MEMBER]: 2,
    [shared_1.UserRole.VIEWER]: 1,
};
function requireRole(minimumRole) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
            });
        }
        const userLevel = roleHierarchy[req.user.role] || 0;
        const requiredLevel = roleHierarchy[minimumRole] || 0;
        if (userLevel < requiredLevel) {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Insufficient permissions for this operation',
                    code: 'FORBIDDEN',
                },
            });
        }
        next();
    };
}
//# sourceMappingURL=rbac.js.map