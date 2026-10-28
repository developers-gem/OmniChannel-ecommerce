"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jwt_1 = require("../utils/jwt");
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: {
                message: 'Authentication token required',
                code: 'UNAUTHORIZED',
            },
        });
    }
    const token = authHeader.split(' ')[1];
    try {
        const claims = (0, jwt_1.verifyAccessToken)(token);
        req.user = claims;
        req.tenantId = claims.organizationId;
        next();
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            error: {
                message: 'Invalid or expired authentication token',
                code: 'TOKEN_EXPIRED',
            },
        });
    }
}
//# sourceMappingURL=auth.js.map