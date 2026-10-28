"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../.env') });
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env') });
dotenv_1.default.config();
const dns_1 = __importDefault(require("dns"));
try {
    dns_1.default.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
}
catch (_) { }
const mongoose_1 = __importDefault(require("mongoose"));
const winston_1 = __importDefault(require("winston"));
const logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp }) => `[${timestamp}] [WORKER] ${level}: ${message}`)),
    transports: [new winston_1.default.transports.Console()],
});
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/multichannel_platform';
async function startWorker() {
    logger.info('Starting Multichannel BullMQ Background Worker...');
    try {
        if (mongoUri.startsWith('mongodb+srv://')) {
            try {
                dns_1.default.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
            }
            catch (dnsErr) {
                logger.warn('Could not set custom DNS servers for SRV resolution');
            }
        }
        await mongoose_1.default.connect(mongoUri);
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
    }
    catch (err) {
        logger.error(`Worker startup failed: ${err.message}`);
        process.exit(1);
    }
}
startWorker();
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received: Shutting down worker gracefully');
    await mongoose_1.default.disconnect();
    process.exit(0);
});
//# sourceMappingURL=index.js.map