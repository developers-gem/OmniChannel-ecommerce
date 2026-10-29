import { Router } from 'express';
import { SyncController } from './sync.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/jobs', SyncController.listJobs);
router.post('/trigger', SyncController.triggerSync);
router.post('/import-to-canonical', SyncController.importToCanonical);
router.post('/reconcile-ebay', SyncController.reconcileEbay);
router.post('/jobs/:id/retry', SyncController.retryJob);

export default router;
