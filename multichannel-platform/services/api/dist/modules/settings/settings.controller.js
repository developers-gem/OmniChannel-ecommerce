"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const models_1 = require("../../database/models");
class SettingsController {
    static async getSettings(req, res) {
        try {
            const org = await models_1.Organization.findById(req.tenantId);
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
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message } });
        }
    }
    static async updateSettings(req, res) {
        try {
            const { name, defaultCurrency, timezone, settings } = req.body;
            const org = await models_1.Organization.findByIdAndUpdate(req.tenantId, {
                $set: {
                    name,
                    defaultCurrency,
                    timezone,
                    settings,
                },
            }, { new: true });
            return res.json({
                success: true,
                data: org,
            });
        }
        catch (error) {
            return res.status(500).json({ success: false, error: { message: error.message } });
        }
    }
}
exports.SettingsController = SettingsController;
//# sourceMappingURL=settings.controller.js.map