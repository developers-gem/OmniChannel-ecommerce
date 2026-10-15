import { Request, Response } from 'express';
import axios from 'axios';
import { ChannelConnection, ChannelProduct, ProductMapping } from '../../database/models';
import { ChannelType, ChannelStatus } from '@multichannel/shared';
import { encryptSecret, decryptSecret, redactSecrets } from '../../utils/crypto';
import { validateSafeUrl } from '../../utils/ssrf';
import { logger } from '../../utils/logger';

export class ChannelsController {
  // GET /api/v1/channels - List all store connections with status and listing counts
  static async list(req: Request, res: Response) {
    try {
      const connections = await ChannelConnection.find({
        organizationId: req.tenantId,
      }).lean();

      const connectionIds = connections.map((c) => c._id);

      const listingCounts = await ChannelProduct.aggregate([
        { $match: { channelConnectionId: { $in: connectionIds } } },
        { $group: { _id: '$channelConnectionId', totalListings: { $sum: 1 } } },
      ]);

      const mappedCounts = await ProductMapping.aggregate([
        { $match: { channelConnectionId: { $in: connectionIds } } },
        { $group: { _id: '$channelConnectionId', totalMapped: { $sum: 1 } } },
      ]);

      const data = connections.map((conn) => {
        const idStr = conn._id.toString();
        const listings =
          listingCounts.find((l) => l._id.toString() === idStr)?.totalListings || 0;
        const mapped =
          mappedCounts.find((m) => m._id.toString() === idStr)?.totalMapped || 0;

        return {
          ...redactSecrets(conn),
          _id: idStr,
          id: idStr,
          totalListings: listings,
          totalMapped: mapped,
        };
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list channels' },
      });
    }
  }

  // POST /api/v1/channels - Connect a new store with live credential validation
  static async create(req: Request, res: Response) {
    try {
      const { channelType, name, config = {}, credentials = {} } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Store nickname is required' },
        });
      }

      // Validate Shopify stores
      if (channelType === ChannelType.SHOPIFY) {
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
          const shopRes = await axios.get(`https://${domain}/admin/api/2024-01/shop.json`, {
            headers: {
              'X-Shopify-Access-Token': token.trim(),
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          });

          if (shopRes.status === 200 && shopRes.data?.shop) {
            config.shopName = shopRes.data.shop.name;
            config.currency = shopRes.data.shop.currency;
            logger.info(`Shopify handshake verified for store ${domain} (${shopRes.data.shop.name})`);
          }
        } catch (shopErr: any) {
          const status = shopErr.response?.status;
          if (status === 401) {
            return res.status(400).json({
              success: false,
              error: {
                message: `Shopify Authentication Failed (401 Unauthorized): The Access Token is invalid for '${domain}'.`,
              },
            });
          } else if (status === 404 || shopErr.code === 'ENOTFOUND') {
            return res.status(400).json({
              success: false,
              error: {
                message: `Shopify Store '${domain}' could not be reached. Please check the spelling of your myshopify.com domain.`,
              },
            });
          } else {
            return res.status(400).json({
              success: false,
              error: {
                message: `Shopify Connection Error: ${shopErr.response?.data?.errors || shopErr.message}`,
              },
            });
          }
        }
      }

      // Validate Custom REST stores
      if (channelType === ChannelType.CUSTOM_STORE) {
        const baseUrl = config?.baseUrl;
        if (!baseUrl) {
          return res.status(400).json({
            success: false,
            error: { message: 'Missing base API URL in store configuration' },
          });
        }
        const ssrfCheck = await validateSafeUrl(baseUrl);
        if (!ssrfCheck.valid) {
          return res.status(400).json({
            success: false,
            error: { message: `SSRF Security Error: ${ssrfCheck.error}` },
          });
        }
      }

      // Encrypt sensitive credential fields
      const encryptedCreds: Record<string, any> = {};
      if (credentials) {
        for (const [key, val] of Object.entries(credentials)) {
          if (typeof val === 'string' && val.length > 0) {
            encryptedCreds[key] = encryptSecret(val);
          } else {
            encryptedCreds[key] = val;
          }
        }
      }

      const connection = await ChannelConnection.create({
        organizationId: req.tenantId,
        channelType,
        name,
        config: config || {},
        credentials: encryptedCreds,
        status: ChannelStatus.ACTIVE,
      });

      logger.info(`Channel connection established: ${name} (${channelType}) for tenant ${req.tenantId}`);

      const connObj = connection.toObject();
      const idStr = connection._id.toString();

      return res.status(201).json({
        success: true,
        data: {
          ...redactSecrets(connObj),
          _id: idStr,
          id: idStr,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to create channel connection' },
      });
    }
  }

  // GET /api/v1/channels/:id - Get channel connection details
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const connection = await ChannelConnection.findOne({
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
          ...redactSecrets(connection),
          _id: idStr,
          id: idStr,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch channel' },
      });
    }
  }

  // POST /api/v1/channels/:id/test - Test connection health with live provider ping
  static async testConnection(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const connection = await ChannelConnection.findOne({
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

      if (channelType === ChannelType.SHOPIFY) {
        let domain = connection.config?.storeDomain || connection.config?.shopDomain || '';
        domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        if (!domain.includes('.myshopify.com')) {
          domain = `${domain}.myshopify.com`;
        }

        const rawTokenEnc = connection.credentials?.accessToken || connection.credentials?.apiKey;
        const token = rawTokenEnc ? decryptSecret(rawTokenEnc) : null;

        if (!token) {
          isHealthy = false;
          message = 'No Shopify access token configured';
        } else {
          try {
            const shopRes = await axios.get(`https://${domain}/admin/api/2024-01/shop.json`, {
              headers: {
                'X-Shopify-Access-Token': token.trim(),
                'Content-Type': 'application/json',
              },
              timeout: 8000,
            });

            if (shopRes.status === 200 && shopRes.data?.shop) {
              isHealthy = true;
              message = `Connected to: ${shopRes.data.shop.name} (${shopRes.data.shop.myshopify_domain})`;
            } else {
              isHealthy = false;
              message = 'Shopify returned an unexpected status code';
            }
          } catch (shopErr: any) {
            isHealthy = false;
            const status = shopErr.response?.status;
            if (status === 401) {
              message = `Authentication Failed (401 Unauthorized): Invalid Access Token for '${domain}'`;
            } else if (status === 404 || shopErr.code === 'ENOTFOUND') {
              message = `Shopify Store '${domain}' not found`;
            } else {
              message = `Shopify Error: ${shopErr.response?.data?.errors || shopErr.message}`;
            }
          }
        }
      } else if (channelType === ChannelType.CUSTOM_STORE) {
        const baseUrl = connection.config?.baseUrl;
        if (!baseUrl) {
          isHealthy = false;
          message = 'Missing base API URL in store configuration';
        } else {
          const ssrfCheck = await validateSafeUrl(baseUrl);
          if (!ssrfCheck.valid) {
            isHealthy = false;
            message = `SSRF Security Check Failed: ${ssrfCheck.error}`;
          }
        }
      }

      connection.status = isHealthy ? ChannelStatus.ACTIVE : ChannelStatus.ERROR;
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
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to test connection' },
      });
    }
  }

  // DELETE /api/v1/channels/:id - Disconnect store and clean mappings safely
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const connection = await ChannelConnection.findOne({
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
      connection.status = ChannelStatus.DISCONNECTED;
      await connection.save();

      // Safely delete mappings associated with this channel
      await ProductMapping.deleteMany({
        organizationId: req.tenantId,
        channelConnectionId: connection._id,
      });

      // Remove channel connection document
      await ChannelConnection.findByIdAndDelete(connection._id);

      logger.info(`Channel ${id} disconnected and purged for tenant ${req.tenantId}`);

      return res.json({
        success: true,
        data: { message: 'Channel disconnected and mappings safely cleared' },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to delete channel' },
      });
    }
  }
}
