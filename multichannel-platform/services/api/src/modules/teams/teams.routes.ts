import { Router } from 'express';
import { TeamsController } from './teams.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { requireRole } from '../../middlewares/rbac';
import { UserRole } from '@multichannel/shared';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', TeamsController.list);
router.put('/:memberId/role', requireRole(UserRole.ADMIN), TeamsController.updateRole);

export default router;
