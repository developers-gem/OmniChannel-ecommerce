import { Router } from 'express';
import { CsvController } from './csv.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.post('/preview', CsvController.preview);
router.post('/import', CsvController.import);
router.get('/jobs', CsvController.getJobs);
router.get('/export', CsvController.export);

export default router;
