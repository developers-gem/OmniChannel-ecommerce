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

  const maxRetries = 3;
  let attempt = 0;

  while (true) {
    attempt++;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error: any) {
      await session.abortTransaction();
      const isTransient =
        error?.errorLabels?.includes('TransientTransactionError') ||
        error?.errorLabels?.includes('UnknownTransactionCommitResult') ||
        error?.code === 112 ||
        error?.codeName === 'WriteConflict' ||
        error?.message?.includes('catalog changes') ||
        error?.message?.includes('WriteConflict');

      if (isTransient && attempt < maxRetries) {
        logger.warn(`[runInTransaction] Retrying transient transaction error (attempt ${attempt}/${maxRetries}): ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
        continue;
      }
      throw error;
    } finally {
      session.endSession();
    }
  }
}
