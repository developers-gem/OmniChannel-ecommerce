import dns from 'dns';
import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function connectDatabase(uri: string = config.mongoUri): Promise<typeof mongoose> {
  try {
    if (uri.startsWith('mongodb+srv://')) {
      try {
        dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
        if ((dns as any).promises?.setServers) {
          (dns as any).promises.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
        }
        dns.setDefaultResultOrder('ipv4first');
      } catch (dnsErr) {
        logger.warn('Could not set custom DNS servers for SRV resolution');
      }
    }
    mongoose.set('strictQuery', true);
    const conn = await mongoose.connect(uri);
    logger.info(`MongoDB Connected successfully to ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export function isTransactionSupported(): boolean {
  try {
    const topology = (mongoose.connection.getClient() as any)?.topology;
    const type = topology?.description?.type;
    return type === 'ReplicaSetWithPrimary' || type === 'Sharded';
  } catch {
    return false;
  }
}

export async function runInTransaction<T>(
  callback: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  if (!isTransactionSupported()) {
    return await callback(null);
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await callback(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
