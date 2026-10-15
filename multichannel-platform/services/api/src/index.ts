import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { connectDatabase } from './database';
import { logger } from './utils/logger';
import { errorHandler } from './middlewares/errorHandler';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import productRoutes from './modules/products/products.routes';
import channelRoutes from './modules/channels/channels.routes';
import mappingRoutes from './modules/mappings/mappings.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import orderRoutes from './modules/orders/orders.routes';
import csvRoutes from './modules/csv/csv.routes';
import pnlRoutes from './modules/pnl/pnl.routes';
import syncRoutes from './modules/sync/sync.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import teamRoutes from './modules/teams/teams.routes';
import auditRoutes from './modules/audit/audit.routes';
import settingRoutes from './modules/settings/settings.routes';
import webhookRoutes from './modules/webhooks/webhooks.routes';

const app = express();

// Security and middleware
app.use(helmet());
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

app.use(
  express.json({
    limit: '20mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

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
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/channels', channelRoutes);
app.use('/api/v1/mappings', mappingRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/csv', csvRoutes);
app.use('/api/v1/pnl', pnlRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/settings', settingRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Global Error Handler
app.use(errorHandler);

// Server startup
let server: any;

export async function startServer() {
  await connectDatabase();
  server = app.listen(config.port, () => {
    logger.info(`Multichannel API running on http://localhost:${config.port}`);
  });
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  }
});

export default app;
