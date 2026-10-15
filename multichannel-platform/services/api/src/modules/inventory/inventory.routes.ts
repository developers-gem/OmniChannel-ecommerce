import { Router } from 'express';
import { InventoryController } from './inventory.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import { UpdateInventorySchema } from '@multichannel/shared';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', InventoryController.list);
router.get('/movements', InventoryController.getMovements);
router.post('/:variantId/adjust', validate(UpdateInventorySchema), InventoryController.adjust);
router.put('/:variantId/allocations', InventoryController.setAllocation);

export default router;
