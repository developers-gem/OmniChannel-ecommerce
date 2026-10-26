import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5050', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/multichannel_platform',
  jwt: {
    secret: process.env.JWT_SECRET || 'super_secure_jwt_secret_change_in_production_32chars!',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'super_secure_refresh_token_secret_change_in_production!',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',
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
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5050',
  webBaseUrl: process.env.WEB_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  rateLimits: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  },
  ebay: {
    clientId: process.env.EBAY_CLIENT_ID || '',
    clientSecret: process.env.EBAY_CLIENT_SECRET || '',
    ruName: process.env.EBAY_RUNAME || '',
    environment: (process.env.EBAY_ENVIRONMENT || 'SANDBOX').toUpperCase(),
    scopes: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    ].join(' '),
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    scopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory,read_orders,write_orders,read_fulfillments,write_fulfillments',
    redirectUri: process.env.SHOPIFY_REDIRECT_URI || 'https://omnichannel-api-m9hx.onrender.com/api/v1/channels/shopify/callback',
  },
};

