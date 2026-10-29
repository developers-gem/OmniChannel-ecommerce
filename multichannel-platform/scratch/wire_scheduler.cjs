const fs = require('fs');
let c = fs.readFileSync('services/api/src/index.ts', 'utf8');

if (!c.includes('SyncSchedulerService')) {
  // Add import
  c = c.replace(
    "import webhookRoutes from './modules/webhooks/webhooks.routes';",
    "import webhookRoutes from './modules/webhooks/webhooks.routes';\nimport { SyncSchedulerService } from './services/sync-scheduler.service';"
  );

  // Add start in startServer
  c = c.replace(
    "server = app.listen(config.port, '0.0.0.0', () => {\n    logger.info(`Multichannel API running on http://0.0.0.0:${config.port}`);\n  });",
    "server = app.listen(config.port, '0.0.0.0', () => {\n    logger.info(`Multichannel API running on http://0.0.0.0:${config.port}`);\n  });\n  SyncSchedulerService.start();"
  );

  // Add stop in SIGTERM
  c = c.replace(
    "logger.info('SIGTERM signal received: closing HTTP server');",
    "logger.info('SIGTERM signal received: closing HTTP server');\n  SyncSchedulerService.stop();"
  );

  fs.writeFileSync('services/api/src/index.ts', c, 'utf8');
  console.log('SyncSchedulerService wired into index.ts');
} else {
  console.log('SyncSchedulerService already present in index.ts');
}
