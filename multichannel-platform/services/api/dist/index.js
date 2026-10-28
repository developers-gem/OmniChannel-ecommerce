"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const dns_1 = __importDefault(require("dns"));
try {
    dns_1.default.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
    if (dns_1.default.promises?.setServers) {
        dns_1.default.promises.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
    }
    dns_1.default.setDefaultResultOrder('ipv4first');
}
catch (_) { }
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const config_1 = require("./config");
const database_1 = require("./database");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./middlewares/errorHandler");
// Reloaded with Shopify OAuth configuration
// Route imports
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const dashboard_routes_1 = __importDefault(require("./modules/dashboard/dashboard.routes"));
const products_routes_1 = __importDefault(require("./modules/products/products.routes"));
const channels_routes_1 = __importDefault(require("./modules/channels/channels.routes"));
const mappings_routes_1 = __importDefault(require("./modules/mappings/mappings.routes"));
const inventory_routes_1 = __importDefault(require("./modules/inventory/inventory.routes"));
const orders_routes_1 = __importDefault(require("./modules/orders/orders.routes"));
const csv_routes_1 = __importDefault(require("./modules/csv/csv.routes"));
const pnl_routes_1 = __importDefault(require("./modules/pnl/pnl.routes"));
const sync_routes_1 = __importDefault(require("./modules/sync/sync.routes"));
const notifications_routes_1 = __importDefault(require("./modules/notifications/notifications.routes"));
const teams_routes_1 = __importDefault(require("./modules/teams/teams.routes"));
const audit_routes_1 = __importDefault(require("./modules/audit/audit.routes"));
const settings_routes_1 = __importDefault(require("./modules/settings/settings.routes"));
const webhooks_routes_1 = __importDefault(require("./modules/webhooks/webhooks.routes"));
const app = (0, express_1.default)();
// Security and middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
app.options('*', (0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({
    limit: '20mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'multichannel-api',
        timestamp: new Date().toISOString(),
    });
});
app.get('/api/v1/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'multichannel-api',
        timestamp: new Date().toISOString(),
    });
});
// Mount module routes
app.use('/api/v1/auth', auth_routes_1.default);
app.use('/api/v1/dashboard', dashboard_routes_1.default);
app.use('/api/v1/products', products_routes_1.default);
app.use('/api/v1/channels', channels_routes_1.default);
app.use('/api/v1/mappings', mappings_routes_1.default);
app.use('/api/v1/inventory', inventory_routes_1.default);
app.use('/api/v1/orders', orders_routes_1.default);
app.use('/api/v1/csv', csv_routes_1.default);
app.use('/api/v1/pnl', pnl_routes_1.default);
app.use('/api/v1/sync', sync_routes_1.default);
app.use('/api/v1/notifications', notifications_routes_1.default);
app.use('/api/v1/teams', teams_routes_1.default);
app.use('/api/v1/audit', audit_routes_1.default);
app.use('/api/v1/settings', settings_routes_1.default);
app.use('/api/v1/webhooks', webhooks_routes_1.default);
// Global Error Handler
app.use(errorHandler_1.errorHandler);
// Server startup
let server;
async function startServer() {
    await (0, database_1.connectDatabase)();
    server = app.listen(config_1.config.port, '0.0.0.0', () => {
        logger_1.logger.info(`Multichannel API running on http://0.0.0.0:${config_1.config.port}`);
    });
    return server;
}
if (process.env.NODE_ENV !== 'test') {
    startServer().catch((err) => {
        logger_1.logger.error('Failed to start server:', err);
        process.exit(1);
    });
}
// Graceful shutdown
process.on('SIGTERM', () => {
    logger_1.logger.info('SIGTERM signal received: closing HTTP server');
    if (server) {
        server.close(() => {
            logger_1.logger.info('HTTP server closed');
            process.exit(0);
        });
    }
});
exports.default = app;
//# sourceMappingURL=index.js.map