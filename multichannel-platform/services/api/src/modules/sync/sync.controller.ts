import { Request, Response } from 'express';
import { SyncJob, ChannelConnection, ChannelProduct } from '../../database/models';
import { SyncJobType, SyncJobStatus } from '@multichannel/shared';
import { logger } from '../../utils/logger';

export class SyncController {
  // GET /api/v1/sync/jobs - List synchronization jobs and status
  static async listJobs(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const total = await SyncJob.countDocuments({ organizationId: req.tenantId });
      const jobs = await SyncJob.find({ organizationId: req.tenantId })
        .populate('channelConnectionId', 'name channelType')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      return res.json({
        success: true,
        data: jobs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list sync jobs' },
      });
    }
  }

  // POST /api/v1/sync/trigger - Trigger synchronization job (Catalog, Inventory, Orders, Reconciliation)
  static async triggerSync(req: Request, res: Response) {
    try {
      const { channelConnectionId, jobType, details } = req.body;

      if (!jobType || !Object.values(SyncJobType).includes(jobType)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Valid jobType is required', code: 'INVALID_JOB_TYPE' },
        });
      }

      let connection = null;
      if (channelConnectionId) {
        connection = await ChannelConnection.findOne({
          _id: channelConnectionId,
          organizationId: req.tenantId,
        });

        if (!connection) {
          return res.status(404).json({
            success: false,
            error: { message: 'Channel connection not found', code: 'CHANNEL_NOT_FOUND' },
          });
        }
      }

      // Create SyncJob record
      const syncJob = await SyncJob.create({
        organizationId: req.tenantId,
        channelConnectionId: connection?._id,
        jobType,
        status: SyncJobStatus.PROCESSING,
        details: details || {},
        attemptCount: 1,
      });

      // Execute sync simulation / processing for local environment
      setTimeout(async () => {
        try {
          syncJob.status = SyncJobStatus.COMPLETED;
          syncJob.finishedAt = new Date();
          syncJob.details = {
            ...syncJob.details,
            message: `Synchronized successfully for ${jobType}`,
            syncedItems: 12,
          };
          await syncJob.save();

          if (connection) {
            connection.lastSyncAt = new Date();
            await connection.save();
          }
        } catch (e) {
          logger.error('Background sync job error:', e);
        }
      }, 1000);

      logger.info(`Sync job dispatched: ${jobType} (Job: ${syncJob._id})`);

      return res.status(202).json({
        success: true,
        data: syncJob,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to trigger sync' },
      });
    }
  }

  // POST /api/v1/sync/jobs/:id/retry - Retry a failed sync job
  static async retryJob(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const job = await SyncJob.findOne({
        _id: id,
        organizationId: req.tenantId,
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: { message: 'Sync job not found', code: 'NOT_FOUND' },
        });
      }

      job.status = SyncJobStatus.QUEUED;
      job.attemptCount += 1;
      job.errorMessage = undefined;
      await job.save();

      return res.json({
        success: true,
        data: job,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to retry sync job' },
      });
    }
  }
}
