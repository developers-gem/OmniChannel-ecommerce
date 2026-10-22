import { Router } from 'express';
import { ChannelsController } from './channels.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import { CreateChannelConnectionSchema } from '@multichannel/shared';

const router = Router();

// Public callback endpoint for OAuth redirection (eBay redirects user browser here)
router.get('/ebay/callback', ChannelsController.handleEbayCallback);

// Authenticated and tenant-isolated routes
router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/ebay/auth-url', ChannelsController.getEbayAuthUrl);
router.post('/ebay/exchange-code', ChannelsController.exchangeEbayCode);

router.get('/', ChannelsController.list);
router.post('/', validate(CreateChannelConnectionSchema), ChannelsController.create);
router.get('/:id', ChannelsController.getById);
router.post('/:id/test', ChannelsController.testConnection);
router.delete('/:id', ChannelsController.delete);

export default router;
