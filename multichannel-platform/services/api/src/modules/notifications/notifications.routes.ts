import { Router } from 'express';
import { NotificationsController } from './notifications.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', NotificationsController.list);
router.put('/:id/read', NotificationsController.markAsRead);
router.put('/read-all', NotificationsController.markAllAsRead);
router.delete('/clear-all', NotificationsController.clearAll);
router.delete('/:id', NotificationsController.delete);

export default router;
