import { Router } from 'express';
import { ChannelsController } from './channels.controller';
import { requireAuth } from '../../middlewares/auth';
import { enforceTenantIsolation } from '../../middlewares/tenant';
import { validate } from '../../middlewares/validate';
import { CreateChannelConnectionSchema } from '@multichannel/shared';

const router = Router();

router.use(requireAuth);
router.use(enforceTenantIsolation);

router.get('/', ChannelsController.list);
router.post('/', validate(CreateChannelConnectionSchema), ChannelsController.create);
router.get('/:id', ChannelsController.getById);
router.post('/:id/test', ChannelsController.testConnection);
router.delete('/:id', ChannelsController.delete);

export default router;
