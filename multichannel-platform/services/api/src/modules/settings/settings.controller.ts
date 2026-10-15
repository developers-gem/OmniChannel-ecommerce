import { Request, Response } from 'express';
import { Organization } from '../../database/models';

export class SettingsController {
  static async getSettings(req: Request, res: Response) {
    try {
      const org = await Organization.findById(req.tenantId);
      if (!org) {
        return res.status(404).json({ success: false, error: { message: 'Organization not found' } });
      }

      return res.json({
        success: true,
        data: {
          name: org.name,
          slug: org.slug,
          defaultCurrency: org.defaultCurrency,
          timezone: org.timezone,
          settings: org.settings,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }
  }

  static async updateSettings(req: Request, res: Response) {
    try {
      const { name, defaultCurrency, timezone, settings } = req.body;

      const org = await Organization.findByIdAndUpdate(
        req.tenantId,
        {
          $set: {
            name,
            defaultCurrency,
            timezone,
            settings,
          },
        },
        { new: true }
      );

      return res.json({
        success: true,
        data: org,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: { message: error.message } });
    }
  }
}
