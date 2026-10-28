"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, next) {
    logger_1.logger.error(`Unhandled error: ${err.message}`, {
        url: req.url,
        method: req.method,
        stack: err.stack,
    });
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: err.code || 'INTERNAL_ERROR',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        },
    });
}
//# sourceMappingURL=errorHandler.js.map