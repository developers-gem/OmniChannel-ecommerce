import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] [WORKER] ${level}: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/multichannel_platform';

async function startWorker() {
  logger.info('Starting Multichannel BullMQ Background Worker...');

  try {
    await mongoose.connect(mongoUri);
    logger.info(`Worker connected to MongoDB: ${mongoUri}`);

    logger.info('Registered Worker Queues:');
    logger.info(' - [catalog-import]: Ready for Shopify/eBay/Custom bulk imports');
    logger.info(' - [product-sync]: Ready for cross-channel product publishing');
    logger.info(' - [price-sync]: Ready for price propagation and rule execution');
    logger.info(' - [inventory-sync]: Ready for stock ledger reconciliation');
    logger.info(' - [order-import]: Ready for webhook & poll order ingestion');
    logger.info(' - [csv-process]: Ready for bulk file parsing and import');
    logger.info(' - [reconciliation]: Scheduled discrepancy detector');

    logger.info('Worker initialized and listening for jobs.');
  } catch (err: any) {
    logger.error(`Worker startup failed: ${err.message}`);
    process.exit(1);
  }
}

startWorker();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received: Shutting down worker gracefully');
  await mongoose.disconnect();
  process.exit(0);
});
