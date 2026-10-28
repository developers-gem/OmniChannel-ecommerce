"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
exports.isTransactionSupported = isTransactionSupported;
exports.runInTransaction = runInTransaction;
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
async function connectDatabase(uri = config_1.config.mongoUri) {
    try {
        if (uri.startsWith('mongodb+srv://')) {
            try {
                dns_1.default.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
                if (dns_1.default.promises?.setServers) {
                    dns_1.default.promises.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
                }
                dns_1.default.setDefaultResultOrder('ipv4first');
            }
            catch (dnsErr) {
                logger_1.logger.warn('Could not set custom DNS servers for SRV resolution');
            }
        }
        mongoose_1.default.set('strictQuery', true);
        const conn = await mongoose_1.default.connect(uri);
        logger_1.logger.info(`MongoDB Connected successfully to ${conn.connection.host}/${conn.connection.name}`);
        return conn;
    }
    catch (error) {
        logger_1.logger.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}
async function disconnectDatabase() {
    await mongoose_1.default.disconnect();
    logger_1.logger.info('MongoDB disconnected');
}
function isTransactionSupported() {
    try {
        const topology = mongoose_1.default.connection.getClient()?.topology;
        const type = topology?.description?.type;
        return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
    }
    catch {
        return false;
    }
}
async function runInTransaction(callback) {
    if (!isTransactionSupported()) {
        return await callback(null);
    }
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        const result = await callback(session);
        await session.commitTransaction();
        return result;
    }
    catch (error) {
        await session.abortTransaction();
        throw error;
    }
    finally {
        session.endSession();
    }
}
//# sourceMappingURL=index.js.map