import { Router } from 'express';
import { SettingsController } from './settings.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { requireRole } from '../../middlewares/rbac';
import { UserRole } from '@multichannel/shared';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', SettingsController.getSettings);
router.put('/', requireRole(UserRole.ADMIN), SettingsController.updateSettings);

export default router;
