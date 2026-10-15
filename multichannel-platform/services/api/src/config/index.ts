import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5050', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/multichannel_platform',
  jwt: {
    secret: process.env.JWT_SECRET || 'super_secure_jwt_secret_change_in_production_32chars!',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'super_secure_refresh_token_secret_change_in_production!',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    useEmbeddedFallback: process.env.REDIS_USE_EMBEDDED_FALLBACK !== 'false',
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  rateLimits: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  },
};
