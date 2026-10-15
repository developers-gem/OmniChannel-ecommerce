import { Router } from 'express';
import { AuditController } from './audit.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { requireRole } from '../../middlewares/rbac';
import { UserRole } from '@multichannel/shared';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);
router.use(requireRole(UserRole.ADMIN));

router.get('/', AuditController.list);

export default router;
