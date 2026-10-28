"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelsController = void 0;
const axios_1 = __importDefault(require("axios"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const models_1 = require("../../database/models");
const shared_1 = require("@multichannel/shared");
const crypto_1 = require("../../utils/crypto");
const ssrf_1 = require("../../utils/ssrf");
const logger_1 = require("../../utils/logger");
const ebay_service_1 = require("../../services/ebay.service");
const shopify_service_1 = require("../../services/shopify.service");
const config_1 = require("../../config");
class ChannelsController {
    // GET /api/v1/channels - List all store connections with status and listing counts
    static async list(req, res) {
        try {
            const connections = await models_1.ChannelConnection.find({
                organizationId: req.tenantId,
            }).lean();
            const connectionIds = connections.map((c) => c._id);
            const listingCounts = await models_1.ChannelProduct.aggregate([
                { $match: { channelConnectionId: { $in: connectionIds } } },
                { $group: { _id: '$channelConnectionId', totalListings: { $sum: 1 } } },
            ]);
            const productCounts = await models_1.ChannelProduct.aggregate([
                { $match: { channelConnectionId: { $in: connectionIds } } },
                {
                    $group: {
                        _id: {
                            channelConnectionId: '$channelConnectionId',
                            externalProductId: '$externalProductId',
                        },
                    },
                },
                {
                    $group: {
                        _id: '$_id.channelConnectionId',
                        totalProducts: { $sum: 1 },
                    },
                },
            ]);
            const mappedCounts = await models_1.ProductMapping.aggregate([
                { $match: { channelConnectionId: { $in: connectionIds }, status: 'MAPPED' } },
                { $group: { _id: '$channelConnectionId', totalMapped: { $sum: 1 } } },
            ]);
            const data = connections.map((conn) => {
                const idStr = conn._id.toString();
                const listings = listingCounts.find((l) => l._id.toString() === idStr)?.totalListings || 0;
                const products = productCounts.find((p) => p._id.toString() === idStr)?.totalProducts || listings;
                const mapped = mappedCounts.find((m) => m._id.toString() === idStr)?.totalMapped || 0;
                return {
                    ...(0, crypto_1.redactSecrets)(conn),
                    _id: idStr,
                    id: idStr,
                    totalListings: listings,
                    totalProducts: products,
                    totalMapped: mapped,
                };
            });
            return res.json({
                success: true,
                data,
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to list channels' },
            });
        }
    }
    // POST /api/v1/channels - Connect a new store with live credential validation
    static async create(req, res) {
        try {
            const { channelType, name, config = {}, credentials = {} } = req.body;
            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Store nickname is required' },
                });
            }
            // Validate Shopify stores
            if (channelType === shared_1.ChannelType.SHOPIFY) {
                let domain = (config?.storeDomain || config?.shopDomain || '').trim();
                domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
                if (!domain || domain.length < 3 || domain.includes('@')) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            message: 'Invalid Shopify domain. Please enter your store domain (e.g., your-store.myshopify.com), not an email address.',
                        },
                    });
                }
                if (!domain.includes('.myshopify.com')) {
                    domain = `${domain}.myshopify.com`;
                }
                config.storeDomain = domain;
                config.shopDomain = domain;
                const token = credentials?.accessToken || credentials?.apiKey;
                if (!token || token.trim().length < 5) {
                    return res.status(400).json({
                        success: false,
                        error: { message: 'A valid Shopify Admin Access Token is required.' },
                    });
                }
                // Live handshake with Shopify Admin API
                try {
                    const shopRes = await axios_1.default.get(`https://${domain}/admin/api/2024-01/shop.json`, {
                        headers: {
                            'X-Shopify-Access-Token': token.trim(),
                            'Content-Type': 'application/json',
                        },
                        timeout: 8000,
                    });
                    if (shopRes.status === 200 && shopRes.data?.shop) {
                        config.shopName = shopRes.data.shop.name;
                        config.currency = shopRes.data.shop.currency;
                        logger_1.logger.info(`Shopify handshake verified for store ${domain} (${shopRes.data.shop.name})`);
                    }
                }
                catch (shopErr) {
                    const status = shopErr.response?.status;
                    if (status === 401) {
                        return res.status(400).json({
                            success: false,
                            error: {
                                message: `Shopify Authentication Failed (401 Unauthorized): The Access Token is invalid for '${domain}'.`,
                            },
                        });
                    }
                    else if (status === 404 || shopErr.code === 'ENOTFOUND') {
                        return res.status(400).json({
                            success: false,
                            error: {
                                message: `Shopify Store '${domain}' could not be reached. Please check the spelling of your myshopify.com domain.`,
                            },
                        });
                    }
                    else {
                        return res.status(400).json({
                            success: false,
                            error: {
                                message: `Shopify Connection Error: ${shopErr.response?.data?.errors || shopErr.message}`,
                            },
                        });
                    }
                }
            }
            // Validate eBay stores live with OAuth Authorization Code / Refresh Token / Access Token
            if (channelType === shared_1.ChannelType.EBAY) {
                const domain = config?.storeDomain || config?.baseUrl || 'api.sandbox.ebay.com';
                const host = ebay_service_1.EbayService.resolveHost(domain);
                config.storeDomain = host;
                config.baseUrl = host;
                let workingAccessToken = null;
                // If authorization code is provided, exchange for tokens
                if (credentials?.code && typeof credentials.code === 'string' && credentials.code.trim().length > 5) {
                    try {
                        const tokens = await ebay_service_1.EbayService.exchangeCodeForTokens(credentials.code.trim(), host, {
                            clientId: config.clientId,
                            clientSecret: config.clientSecret,
                            ruName: config.ruName,
                        });
                        credentials.accessToken = tokens.accessToken;
                        credentials.refreshToken = tokens.refreshToken;
                        credentials.expiresAt = new Date(Date.now() + (tokens.expiresIn || 7200) * 1000);
                        credentials.tokenType = tokens.tokenType || 'User Access Token';
                        delete credentials.code;
                        workingAccessToken = tokens.accessToken;
                    }
                    catch (codeErr) {
                        return res.status(400).json({
                            success: false,
                            error: { message: codeErr.message || 'Failed to exchange authorization code with eBay' },
                        });
                    }
                }
                else if (credentials?.refreshToken && typeof credentials.refreshToken === 'string' && credentials.refreshToken.trim().length > 5) {
                    // If refresh token is provided, verify it by generating a fresh access token
                    try {
                        const refreshed = await ebay_service_1.EbayService.refreshAccessToken(credentials.refreshToken.trim(), host, {
                            clientId: config.clientId,
                            clientSecret: config.clientSecret,
                        });
                        credentials.accessToken = refreshed.accessToken;
                        credentials.expiresAt = new Date(Date.now() + (refreshed.expiresIn || 7200) * 1000);
                        if (refreshed.refreshToken) {
                            credentials.refreshToken = refreshed.refreshToken;
                        }
                        credentials.tokenType = refreshed.tokenType || 'User Access Token';
                        workingAccessToken = refreshed.accessToken;
                    }
                    catch (refreshErr) {
                        return res.status(400).json({
                            success: false,
                            error: { message: `eBay Refresh Token verification failed: ${refreshErr.message}` },
                        });
                    }
                }
                else if (credentials?.accessToken || credentials?.apiKey) {
                    workingAccessToken = (credentials.accessToken || credentials.apiKey).trim();
                }
                if (!workingAccessToken || workingAccessToken.length < 10) {
                    return res.status(400).json({
                        success: false,
                        error: { message: 'A valid eBay Refresh Token, Authorization Code, or User OAuth Token is required.' },
                    });
                }
                try {
                    await ebay_service_1.EbayService.validateCredentials(host, workingAccessToken);
                    logger_1.logger.info(`eBay handshake verified for store ${name} on ${host}`);
                }
                catch (ebayErr) {
                    return res.status(400).json({
                        success: false,
                        error: {
                            message: ebayErr.message || 'eBay Authentication Failed: The provided OAuth User Token is invalid or expired.',
                        },
                    });
                }
            }
            // Validate Custom REST stores
            if (channelType === shared_1.ChannelType.CUSTOM_STORE) {
                const baseUrl = config?.baseUrl;
                if (!baseUrl) {
                    return res.status(400).json({
                        success: false,
                        error: { message: 'Missing base API URL in store configuration' },
                    });
                }
                const ssrfCheck = await (0, ssrf_1.validateSafeUrl)(baseUrl);
                if (!ssrfCheck.valid) {
                    return res.status(400).json({
                        success: false,
                        error: { message: `SSRF Security Error: ${ssrfCheck.error}` },
                    });
                }
            }
            // Encrypt sensitive credential fields
            const encryptedCreds = {};
            if (credentials) {
                for (const [key, val] of Object.entries(credentials)) {
                    if (typeof val === 'string' && val.length > 0) {
                        encryptedCreds[key] = (0, crypto_1.encryptSecret)(val);
                    }
                    else {
                        encryptedCreds[key] = val;
                    }
                }
            }
            const connection = await models_1.ChannelConnection.create({
                organizationId: req.tenantId,
                channelType,
                name,
                config: config || {},
                credentials: encryptedCreds,
                status: shared_1.ChannelStatus.ACTIVE,
            });
            logger_1.logger.info(`Channel connection established: ${name} (${channelType}) for tenant ${req.tenantId}`);
            if (channelType === shared_1.ChannelType.SHOPIFY) {
                try {
                    const { domain, token } = shopify_service_1.ShopifyService.getCredentials(connection);
                    // Auto-register webhooks asynchronously
                    shopify_service_1.ShopifyService.registerWebhooks(domain, token, connection._id.toString()).catch((err) => logger_1.logger.warn(`Could not auto-register Shopify webhooks for ${domain}: ${err.message}`));
                    // Initial catalog import in background
                    (async () => {
                        try {
                            const products = await shopify_service_1.ShopifyService.fetchAllProducts(domain, token);
                            for (const prod of products) {
                                await shopify_service_1.ShopifyService.ingestShopifyProduct({
                                    organizationId: req.tenantId,
                                    connection,
                                    shopifyProduct: prod,
                                });
                            }
                            logger_1.logger.info(`Initial catalog auto-import finished for ${domain}: ${products.length} products`);
                        }
                        catch (impErr) {
                            logger_1.logger.warn(`Initial catalog import failed for ${domain}: ${impErr.message}`);
                        }
                    })();
                }
                catch (initErr) {
                    logger_1.logger.warn(`Could not start Shopify background initialization: ${initErr.message}`);
                }
            }
            const connObj = connection.toObject();
            const idStr = connection._id.toString();
            return res.status(201).json({
                success: true,
                data: {
                    ...(0, crypto_1.redactSecrets)(connObj),
                    _id: idStr,
                    id: idStr,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to create channel connection' },
            });
        }
    }
    // GET /api/v1/channels/:id - Get channel connection details
    static async getById(req, res) {
        try {
            const { id } = req.params;
            const connection = await models_1.ChannelConnection.findOne({
                _id: id,
                organizationId: req.tenantId,
            }).lean();
            if (!connection) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Channel not found', code: 'NOT_FOUND' },
                });
            }
            const idStr = connection._id.toString();
            return res.json({
                success: true,
                data: {
                    ...(0, crypto_1.redactSecrets)(connection),
                    _id: idStr,
                    id: idStr,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch channel' },
            });
        }
    }
    // POST /api/v1/channels/:id/test - Test connection health with live provider ping
    static async testConnection(req, res) {
        try {
            const { id } = req.params;
            const connection = await models_1.ChannelConnection.findOne({
                _id: id,
                organizationId: req.tenantId,
            });
            if (!connection) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Channel not found', code: 'NOT_FOUND' },
                });
            }
            const channelType = connection.channelType;
            let isHealthy = true;
            let message = 'Connection verified successfully';
            if (channelType === shared_1.ChannelType.SHOPIFY) {
                let domain = connection.config?.storeDomain || connection.config?.shopDomain || '';
                domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
                if (!domain.includes('.myshopify.com')) {
                    domain = `${domain}.myshopify.com`;
                }
                const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
                const token = rawTokenEnc ? (0, crypto_1.decryptSecret)(rawTokenEnc) : null;
                if (!token) {
                    isHealthy = false;
                    message = 'No Shopify access token configured';
                }
                else {
                    try {
                        const shopRes = await axios_1.default.get(`https://${domain}/admin/api/2024-01/shop.json`, {
                            headers: {
                                'X-Shopify-Access-Token': token.trim(),
                                'Content-Type': 'application/json',
                            },
                            timeout: 8000,
                        });
                        if (shopRes.status === 200 && shopRes.data?.shop) {
                            isHealthy = true;
                            message = `Connected to: ${shopRes.data.shop.name} (${shopRes.data.shop.myshopify_domain})`;
                        }
                        else {
                            isHealthy = false;
                            message = 'Shopify returned an unexpected status code';
                        }
                    }
                    catch (shopErr) {
                        isHealthy = false;
                        const status = shopErr.response?.status;
                        if (status === 401) {
                            message = `Authentication Failed (401 Unauthorized): Invalid Access Token for '${domain}'`;
                        }
                        else if (status === 404 || shopErr.code === 'ENOTFOUND') {
                            message = `Shopify Store '${domain}' not found`;
                        }
                        else {
                            message = `Shopify Error: ${shopErr.response?.data?.errors || shopErr.message}`;
                        }
                    }
                }
            }
            else if (channelType === shared_1.ChannelType.EBAY) {
                try {
                    const { host, token } = await ebay_service_1.EbayService.getValidCredentials(connection);
                    await ebay_service_1.EbayService.validateCredentials(host, token);
                    isHealthy = true;
                    message = `Connected & verified with eBay API (${host})`;
                }
                catch (ebayErr) {
                    isHealthy = false;
                    message = ebayErr.message || 'eBay token is invalid or expired';
                }
            }
            else if (channelType === shared_1.ChannelType.CUSTOM_STORE) {
                const baseUrl = connection.config?.baseUrl;
                if (!baseUrl) {
                    isHealthy = false;
                    message = 'Missing base API URL in store configuration';
                }
                else {
                    const ssrfCheck = await (0, ssrf_1.validateSafeUrl)(baseUrl);
                    if (!ssrfCheck.valid) {
                        isHealthy = false;
                        message = `SSRF Security Check Failed: ${ssrfCheck.error}`;
                    }
                }
            }
            connection.status = isHealthy ? shared_1.ChannelStatus.ACTIVE : shared_1.ChannelStatus.ERROR;
            connection.lastSyncAt = new Date();
            await connection.save();
            return res.json({
                success: true,
                data: {
                    healthy: isHealthy,
                    status: connection.status,
                    message,
                    lastChecked: connection.lastSyncAt,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to test connection' },
            });
        }
    }
    // DELETE /api/v1/channels/:id - Disconnect store and clean mappings safely
    static async delete(req, res) {
        try {
            const { id } = req.params;
            const connection = await models_1.ChannelConnection.findOne({
                _id: id,
                organizationId: req.tenantId,
            });
            if (!connection) {
                return res.status(404).json({
                    success: false,
                    error: { message: 'Channel not found', code: 'NOT_FOUND' },
                });
            }
            // Mark connection disconnected
            connection.status = shared_1.ChannelStatus.DISCONNECTED;
            await connection.save();
            // Safely delete mappings associated with this channel
            await models_1.ProductMapping.deleteMany({
                organizationId: req.tenantId,
                channelConnectionId: connection._id,
            });
            // Remove channel connection document
            await models_1.ChannelConnection.findByIdAndDelete(connection._id);
            logger_1.logger.info(`Channel ${id} disconnected and purged for tenant ${req.tenantId}`);
            return res.json({
                success: true,
                data: { message: 'Channel disconnected and mappings safely cleared' },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to delete channel' },
            });
        }
    }
    // GET /api/v1/channels/ebay/auth-url - Generate eBay Consent Screen URL
    static async getEbayAuthUrl(req, res) {
        try {
            const name = req.query.name || 'eBay Store';
            const environment = (req.query.environment || 'SANDBOX').toUpperCase();
            const host = environment === 'PRODUCTION' ? 'api.ebay.com' : 'api.sandbox.ebay.com';
            const statePayload = {
                organizationId: req.tenantId,
                userId: req.user?.userId || req.user?._id || req.user?.id,
                name,
                environment,
            };
            const stateToken = jsonwebtoken_1.default.sign(statePayload, config_1.config.jwt.secret, { expiresIn: '30m' });
            const authUrl = ebay_service_1.EbayService.generateConsentUrl({
                hostOrEnv: host,
                state: stateToken,
            });
            return res.json({
                success: true,
                data: {
                    url: authUrl,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to generate eBay authorization URL' },
            });
        }
    }
    // Helper to render HTML with popup postMessage or direct redirect
    static renderEbayCallbackHtml(res, success, message) {
        const targetUrl = success
            ? `${config_1.config.webBaseUrl}/channels?ebay_connected=true`
            : `${config_1.config.webBaseUrl}/channels?ebay_error=${encodeURIComponent(message || 'Authorization failed')}`;
        const eventType = success ? 'EBAY_AUTH_SUCCESS' : 'EBAY_AUTH_ERROR';
        return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>eBay Authorization</title>
  <meta http-equiv="refresh" content="2;url=${targetUrl}">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 32px; border-radius: 16px; text-align: center; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: ${success ? '#34d399' : '#f87171'}; font-size: 20px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; }
    .btn { display: inline-block; margin-top: 16px; padding: 8px 16px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${success ? '✓ Authorization Successful!' : '✕ Authorization Failed'}</h2>
    <p>${success ? 'Your eBay store has been successfully connected to the platform. This window will close automatically...' : (message || 'Authorization was cancelled or encountered an error.')}</p>
    <a href="${targetUrl}" class="btn">Return to Platform</a>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: '${eventType}', success: ${success}, error: ${JSON.stringify(message || '')} }, '*');
        setTimeout(function() { window.close(); }, 800);
      } else {
        setTimeout(function() { window.location.href = "${targetUrl}"; }, 1200);
      }
    } catch (e) {
      setTimeout(function() { window.location.href = "${targetUrl}"; }, 1200);
    }
  </script>
</body>
</html>`);
    }
    // GET /api/v1/channels/ebay/callback - Public OAuth redirect handler from eBay
    static async handleEbayCallback(req, res) {
        const { code, state, error, error_description } = req.query;
        if (error || error_description) {
            const errMsg = (error_description || error || 'Authorization was cancelled');
            logger_1.logger.warn(`[eBay OAuth Callback] Error returned by eBay: ${errMsg}`);
            return ChannelsController.renderEbayCallbackHtml(res, false, errMsg);
        }
        if (!code || !state) {
            return ChannelsController.renderEbayCallbackHtml(res, false, 'Missing authorization code or state parameter');
        }
        let decodedState;
        try {
            decodedState = jsonwebtoken_1.default.verify(state, config_1.config.jwt.secret);
        }
        catch (err) {
            logger_1.logger.error(`[eBay OAuth Callback] Invalid state verification: ${err.message}`);
            return ChannelsController.renderEbayCallbackHtml(res, false, 'OAuth session expired or invalid state token');
        }
        try {
            const host = decodedState.environment === 'PRODUCTION' ? 'api.ebay.com' : 'api.sandbox.ebay.com';
            const cleanCode = ebay_service_1.EbayService.extractAuthCode(code);
            const tokens = await ebay_service_1.EbayService.exchangeCodeForTokens(cleanCode, host);
            await ebay_service_1.EbayService.validateCredentials(host, tokens.accessToken);
            const expiresAt = new Date(Date.now() + (tokens.expiresIn || 7200) * 1000);
            const encryptedCreds = {
                accessToken: (0, crypto_1.encryptSecret)(tokens.accessToken),
                refreshToken: (0, crypto_1.encryptSecret)(tokens.refreshToken),
                expiresAt,
                tokenType: tokens.tokenType || 'User Access Token',
            };
            const existing = (decodedState.name
                ? await models_1.ChannelConnection.findOne({
                    organizationId: decodedState.organizationId,
                    channelType: shared_1.ChannelType.EBAY,
                    name: decodedState.name,
                })
                : null) ||
                (await models_1.ChannelConnection.findOne({
                    organizationId: decodedState.organizationId,
                    channelType: shared_1.ChannelType.EBAY,
                    'config.environment': decodedState.environment || 'SANDBOX',
                })) ||
                (await models_1.ChannelConnection.findOne({
                    organizationId: decodedState.organizationId,
                    channelType: shared_1.ChannelType.EBAY,
                }));
            if (existing) {
                existing.name = decodedState.name || existing.name;
                existing.config = {
                    ...(existing.config || {}),
                    storeDomain: host,
                    baseUrl: host,
                    environment: decodedState.environment || 'SANDBOX',
                };
                existing.credentials = encryptedCreds;
                existing.status = shared_1.ChannelStatus.ACTIVE;
                existing.lastSyncAt = new Date();
                await existing.save();
                logger_1.logger.info(`[eBay OAuth] Successfully reconnected store ${existing.name} via OAuth`);
            }
            else {
                await models_1.ChannelConnection.create({
                    organizationId: decodedState.organizationId,
                    channelType: shared_1.ChannelType.EBAY,
                    name: decodedState.name || 'eBay Store',
                    config: {
                        storeDomain: host,
                        baseUrl: host,
                        environment: decodedState.environment || 'SANDBOX',
                    },
                    credentials: encryptedCreds,
                    status: shared_1.ChannelStatus.ACTIVE,
                });
                logger_1.logger.info(`[eBay OAuth] Created new eBay channel connection via OAuth`);
            }
            return ChannelsController.renderEbayCallbackHtml(res, true);
        }
        catch (err) {
            logger_1.logger.error(`[eBay OAuth Callback] Token exchange failed: ${err.message}`);
            return ChannelsController.renderEbayCallbackHtml(res, false, err.message || 'Failed to exchange authorization code with eBay');
        }
    }
    // POST /api/v1/channels/ebay/exchange-code - Exchange authorization code directly
    static async exchangeEbayCode(req, res) {
        try {
            const { code, name = 'eBay Store', environment = 'SANDBOX', config: extraConfig = {} } = req.body;
            const cleanCode = ebay_service_1.EbayService.extractAuthCode(code);
            if (!cleanCode || cleanCode.length < 5) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'A valid authorization code or eBay redirect URL is required' },
                });
            }
            const host = environment.toUpperCase() === 'PRODUCTION' ? 'api.ebay.com' : 'api.sandbox.ebay.com';
            const tokens = await ebay_service_1.EbayService.exchangeCodeForTokens(cleanCode, host);
            await ebay_service_1.EbayService.validateCredentials(host, tokens.accessToken);
            const expiresAt = new Date(Date.now() + (tokens.expiresIn || 7200) * 1000);
            const encryptedCreds = {
                accessToken: (0, crypto_1.encryptSecret)(tokens.accessToken),
                refreshToken: (0, crypto_1.encryptSecret)(tokens.refreshToken),
                expiresAt,
                tokenType: tokens.tokenType || 'User Access Token',
            };
            const trimmedName = name?.trim();
            const existing = (trimmedName
                ? await models_1.ChannelConnection.findOne({
                    organizationId: req.tenantId,
                    channelType: shared_1.ChannelType.EBAY,
                    name: trimmedName,
                })
                : null) ||
                (await models_1.ChannelConnection.findOne({
                    organizationId: req.tenantId,
                    channelType: shared_1.ChannelType.EBAY,
                    'config.environment': environment.toUpperCase(),
                })) ||
                (await models_1.ChannelConnection.findOne({
                    organizationId: req.tenantId,
                    channelType: shared_1.ChannelType.EBAY,
                }));
            let connection;
            if (existing) {
                existing.name = name.trim() || existing.name;
                existing.config = {
                    ...(existing.config || {}),
                    ...extraConfig,
                    storeDomain: host,
                    baseUrl: host,
                    environment: environment.toUpperCase(),
                };
                existing.credentials = encryptedCreds;
                existing.status = shared_1.ChannelStatus.ACTIVE;
                existing.lastSyncAt = new Date();
                connection = await existing.save();
                logger_1.logger.info(`[eBay OAuth] Successfully reconnected store ${existing.name} via exchange-code`);
            }
            else {
                connection = await models_1.ChannelConnection.create({
                    organizationId: req.tenantId,
                    channelType: shared_1.ChannelType.EBAY,
                    name: name.trim() || 'eBay Store',
                    config: {
                        ...extraConfig,
                        storeDomain: host,
                        baseUrl: host,
                        environment: environment.toUpperCase(),
                    },
                    credentials: encryptedCreds,
                    status: shared_1.ChannelStatus.ACTIVE,
                });
                logger_1.logger.info(`[eBay OAuth] Created new eBay channel connection via exchange-code`);
            }
            return res.status(200).json({
                success: true,
                data: {
                    ...(0, crypto_1.redactSecrets)(connection.toObject()),
                    _id: connection._id.toString(),
                    id: connection._id.toString(),
                },
            });
        }
        catch (err) {
            logger_1.logger.error(`[eBay OAuth exchange-code] Token exchange failed: ${err.message}`);
            return res.status(400).json({
                success: false,
                error: { message: err.message || 'Failed to exchange authorization code' },
            });
        }
    }
    // Helper to render HTML with popup postMessage or direct redirect for Shopify
    static renderShopifyCallbackHtml(res, success, message, storeName) {
        const targetUrl = success
            ? `${config_1.config.webBaseUrl}/channels?shopify_connected=true`
            : `${config_1.config.webBaseUrl}/channels?shopify_error=${encodeURIComponent(message || 'Authorization failed')}`;
        const eventType = success ? 'SHOPIFY_AUTH_SUCCESS' : 'SHOPIFY_AUTH_ERROR';
        return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Shopify Authorization</title>
  <meta http-equiv="refresh" content="2;url=${targetUrl}">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 32px; border-radius: 16px; text-align: center; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h2 { margin-top: 0; color: ${success ? '#34d399' : '#f87171'}; font-size: 20px; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.5; }
    .store-badge { display: inline-block; margin: 8px 0; padding: 4px 12px; background: rgba(52, 211, 153, 0.15); color: #34d399; border-radius: 9999px; font-size: 12px; font-weight: 600; }
    .btn { display: inline-block; margin-top: 16px; padding: 8px 16px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${success ? '✓ Shopify Store Connected!' : '✕ Shopify Authorization Failed'}</h2>
    ${storeName ? `<div class="store-badge">🛍️ ${storeName}</div>` : ''}
    <p>${success ? 'Your Shopify store has been successfully connected with a permanent offline access token. This window will close automatically...' : (message || 'Authorization was cancelled or encountered an error.')}</p>
    <a href="${targetUrl}" class="btn">Return to Platform</a>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: '${eventType}', success: ${success}, error: ${JSON.stringify(message || '')}, storeName: ${JSON.stringify(storeName || '')} }, '*');
        setTimeout(function() { window.close(); }, 800);
      } else {
        setTimeout(function() { window.location.href = "${targetUrl}"; }, 1200);
      }
    } catch (e) {
      setTimeout(function() { window.location.href = "${targetUrl}"; }, 1200);
    }
  </script>
</body>
</html>`);
    }
    // GET /api/v1/channels/shopify/auth-url - Generate Shopify OAuth Authorization URL
    static async getShopifyAuthUrl(req, res) {
        try {
            const { shop, name, clientId, clientSecret, redirectUri } = req.query;
            if (!shop || typeof shop !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Shop domain is required (e.g., your-store.myshopify.com)' },
                });
            }
            let cleanDomain = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
            if (!cleanDomain.includes('.myshopify.com')) {
                cleanDomain = `${cleanDomain}.myshopify.com`;
            }
            const effectiveClientId = clientId?.trim() || config_1.config.shopify.apiKey;
            const effectiveClientSecret = clientSecret?.trim() || config_1.config.shopify.apiSecret;
            const effectiveRedirectUri = redirectUri?.trim() || config_1.config.shopify.redirectUri;
            if (!effectiveClientId || !effectiveClientSecret) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Shopify Client ID and Client Secret are required' },
                });
            }
            const statePayload = {
                organizationId: req.tenantId,
                userId: req.user?.userId || req.user?._id || req.user?.id,
                name: name?.trim() || cleanDomain.replace('.myshopify.com', ''),
                shop: cleanDomain,
                clientId: effectiveClientId,
                clientSecret: effectiveClientSecret,
                redirectUri: effectiveRedirectUri,
            };
            const stateToken = jsonwebtoken_1.default.sign(statePayload, config_1.config.jwt.secret, { expiresIn: '30m' });
            const scopes = encodeURIComponent(config_1.config.shopify.scopes);
            const encodedRedirectUri = encodeURIComponent(effectiveRedirectUri);
            // Omitting grant_options ensures Shopify issues a permanent offline access token
            const authUrl = `https://${cleanDomain}/admin/oauth/authorize?client_id=${effectiveClientId}&scope=${scopes}&redirect_uri=${encodedRedirectUri}&state=${stateToken}`;
            return res.json({
                success: true,
                data: {
                    url: authUrl,
                    domain: cleanDomain,
                    redirectUri: effectiveRedirectUri,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to generate Shopify authorization URL' },
            });
        }
    }
    // GET /api/v1/channels/shopify/callback - Public OAuth redirect handler from Shopify
    static async handleShopifyCallback(req, res) {
        const { code, shop, state, error, error_description } = req.query;
        if (error || error_description) {
            const errMsg = (error_description || error || 'Authorization was cancelled');
            logger_1.logger.warn(`[Shopify OAuth Callback] Error: ${errMsg}`);
            return ChannelsController.renderShopifyCallbackHtml(res, false, errMsg);
        }
        if (!code || !shop) {
            return ChannelsController.renderShopifyCallbackHtml(res, false, 'Missing code or shop parameter');
        }
        let decodedState = null;
        if (state && typeof state === 'string') {
            try {
                decodedState = jsonwebtoken_1.default.verify(state, config_1.config.jwt.secret);
            }
            catch (err) {
                logger_1.logger.warn(`[Shopify OAuth Callback] State token verification warning: ${err.message}`);
            }
        }
        let cleanShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
        if (!cleanShop.includes('.myshopify.com')) {
            cleanShop = `${cleanShop}.myshopify.com`;
        }
        const clientId = decodedState?.clientId || config_1.config.shopify.apiKey;
        const clientSecret = decodedState?.clientSecret || config_1.config.shopify.apiSecret;
        if (!clientId || !clientSecret) {
            return ChannelsController.renderShopifyCallbackHtml(res, false, 'Missing Client ID or Secret for token exchange');
        }
        try {
            // Exchange authorization code for permanent offline access token
            const tokenRes = await axios_1.default.post(`https://${cleanShop}/admin/oauth/access_token`, {
                client_id: clientId,
                client_secret: clientSecret,
                code: code.trim(),
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
            });
            const { access_token, scope } = tokenRes.data;
            if (!access_token) {
                throw new Error('Shopify did not return an access token');
            }
            // Verify connection and retrieve store metadata
            const shopRes = await axios_1.default.get(`https://${cleanShop}/admin/api/2024-01/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            const shopData = shopRes.data?.shop || {};
            const storeDisplayName = shopData.name || decodedState?.name || cleanShop.replace('.myshopify.com', '');
            const organizationId = decodedState?.organizationId;
            if (!organizationId) {
                return ChannelsController.renderShopifyCallbackHtml(res, false, 'Missing organization context in OAuth state');
            }
            const encryptedCreds = {
                accessToken: (0, crypto_1.encryptSecret)(access_token),
                clientId: (0, crypto_1.encryptSecret)(clientId),
                clientSecret: (0, crypto_1.encryptSecret)(clientSecret),
                scope: scope || config_1.config.shopify.scopes,
                tokenType: 'Offline Access Token',
            };
            const existing = await models_1.ChannelConnection.findOne({
                organizationId,
                channelType: shared_1.ChannelType.SHOPIFY,
                $or: [
                    { 'config.storeDomain': cleanShop },
                    { 'config.shopDomain': cleanShop },
                ],
            });
            if (existing) {
                existing.name = decodedState?.name || existing.name;
                existing.config = {
                    ...(existing.config || {}),
                    storeDomain: cleanShop,
                    shopDomain: cleanShop,
                    shopName: shopData.name || existing.config?.shopName,
                    currency: shopData.currency || existing.config?.currency,
                };
                existing.credentials = encryptedCreds;
                existing.status = shared_1.ChannelStatus.ACTIVE;
                existing.lastSyncAt = new Date();
                await existing.save();
                logger_1.logger.info(`[Shopify OAuth] Successfully updated store connection ${existing.name} (${cleanShop})`);
            }
            else {
                await models_1.ChannelConnection.create({
                    organizationId,
                    channelType: shared_1.ChannelType.SHOPIFY,
                    name: decodedState?.name || storeDisplayName,
                    config: {
                        storeDomain: cleanShop,
                        shopDomain: cleanShop,
                        shopName: shopData.name,
                        currency: shopData.currency || 'USD',
                    },
                    credentials: encryptedCreds,
                    status: shared_1.ChannelStatus.ACTIVE,
                });
                logger_1.logger.info(`[Shopify OAuth] Created new permanent Shopify connection for ${cleanShop}`);
            }
            return ChannelsController.renderShopifyCallbackHtml(res, true, undefined, storeDisplayName);
        }
        catch (err) {
            const errDetail = err.response?.data?.error_description || err.response?.data?.errors || err.message;
            logger_1.logger.error(`[Shopify OAuth Callback] Token exchange failed: ${errDetail}`);
            return ChannelsController.renderShopifyCallbackHtml(res, false, errDetail);
        }
    }
    // POST /api/v1/channels/shopify/exchange-code - Exchange authorization code directly
    static async exchangeShopifyCode(req, res) {
        try {
            const { code, shop, name, clientId, clientSecret } = req.body;
            if (!code || !shop) {
                return res.status(400).json({
                    success: false,
                    error: { message: 'Authorization code and shop domain are required' },
                });
            }
            let cleanShop = shop.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
            if (!cleanShop.includes('.myshopify.com')) {
                cleanShop = `${cleanShop}.myshopify.com`;
            }
            const effectiveClientId = clientId?.trim() || config_1.config.shopify.apiKey;
            const effectiveClientSecret = clientSecret?.trim() || config_1.config.shopify.apiSecret;
            const tokenRes = await axios_1.default.post(`https://${cleanShop}/admin/oauth/access_token`, {
                client_id: effectiveClientId,
                client_secret: effectiveClientSecret,
                code: code.trim(),
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
            });
            const { access_token, scope } = tokenRes.data;
            if (!access_token) {
                throw new Error('Shopify did not return an access token');
            }
            const shopRes = await axios_1.default.get(`https://${cleanShop}/admin/api/2024-01/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
            });
            const shopData = shopRes.data?.shop || {};
            const storeDisplayName = name?.trim() || shopData.name || cleanShop.replace('.myshopify.com', '');
            const encryptedCreds = {
                accessToken: (0, crypto_1.encryptSecret)(access_token),
                clientId: (0, crypto_1.encryptSecret)(effectiveClientId),
                clientSecret: (0, crypto_1.encryptSecret)(effectiveClientSecret),
                scope: scope || config_1.config.shopify.scopes,
                tokenType: 'Offline Access Token',
            };
            const existing = await models_1.ChannelConnection.findOne({
                organizationId: req.tenantId,
                channelType: shared_1.ChannelType.SHOPIFY,
                $or: [
                    { 'config.storeDomain': cleanShop },
                    { 'config.shopDomain': cleanShop },
                ],
            });
            let connection;
            if (existing) {
                existing.name = storeDisplayName;
                existing.config = {
                    ...(existing.config || {}),
                    storeDomain: cleanShop,
                    shopDomain: cleanShop,
                    shopName: shopData.name,
                    currency: shopData.currency,
                };
                existing.credentials = encryptedCreds;
                existing.status = shared_1.ChannelStatus.ACTIVE;
                existing.lastSyncAt = new Date();
                connection = await existing.save();
            }
            else {
                connection = await models_1.ChannelConnection.create({
                    organizationId: req.tenantId,
                    channelType: shared_1.ChannelType.SHOPIFY,
                    name: storeDisplayName,
                    config: {
                        storeDomain: cleanShop,
                        shopDomain: cleanShop,
                        shopName: shopData.name,
                        currency: shopData.currency || 'USD',
                    },
                    credentials: encryptedCreds,
                    status: shared_1.ChannelStatus.ACTIVE,
                });
            }
            return res.status(200).json({
                success: true,
                data: {
                    ...(0, crypto_1.redactSecrets)(connection.toObject()),
                    _id: connection._id.toString(),
                    id: connection._id.toString(),
                },
            });
        }
        catch (err) {
            const errDetail = err.response?.data?.error_description || err.response?.data?.errors || err.message;
            return res.status(400).json({
                success: false,
                error: { message: errDetail || 'Failed to exchange Shopify authorization code' },
            });
        }
    }
}
exports.ChannelsController = ChannelsController;
//# sourceMappingURL=channels.controller.js.map