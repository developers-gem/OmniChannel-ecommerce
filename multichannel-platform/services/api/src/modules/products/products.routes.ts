import { Router } from 'express';
import { ProductsController } from './products.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import { CreateProductSchema } from '@multichannel/shared';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', ProductsController.list);
router.get('/zero-mapped', ProductsController.listZeroMapped);
router.post('/bulk-publish', ProductsController.bulkPublish);
router.get('/:id', ProductsController.getById);
router.post('/', validate(CreateProductSchema), ProductsController.create);
router.put('/:id', ProductsController.update);
router.post('/:id/publish', ProductsController.publish);
router.delete('/:id', ProductsController.delete);

export default router;
