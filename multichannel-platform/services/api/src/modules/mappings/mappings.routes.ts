import { Router } from 'express';
import { MappingsController } from './mappings.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', MappingsController.list);
router.get('/unmapped', MappingsController.listUnmapped);
router.get('/suggestions', MappingsController.getSuggestions);
router.post('/map', MappingsController.map);
router.post('/bulk-map', MappingsController.bulkMap);
router.post('/:id/remap', MappingsController.remap);
router.delete('/', MappingsController.unmapAll);
router.delete('/:id/permanent', MappingsController.deletePermanent);
router.delete('/:id', MappingsController.unmap);

export default router;
