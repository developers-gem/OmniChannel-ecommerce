import { Router } from 'express';
import { OrdersController } from './orders.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', OrdersController.list);
router.get('/:id', OrdersController.getById);
router.post('/:id/fulfill', OrdersController.fulfill);
router.post('/:id/cancel', OrdersController.cancel);

export default router;
