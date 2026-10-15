import { Router } from 'express';
import { PnLController } from './pnl.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/summary', PnLController.getSummary);
router.get('/products', PnLController.getProductProfitability);
router.get('/channels', PnLController.getChannelProfitability);
router.get('/trends', PnLController.getTrends);

export default router;
