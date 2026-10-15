import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middlewares/validate';
import { requireAuth } from '../../middlewares/auth';
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from '@multichannel/shared';

const router = Router();

router.post('/register', validate(RegisterSchema), AuthController.register);
router.post('/login', validate(LoginSchema), AuthController.login);
router.post('/refresh', validate(RefreshTokenSchema), AuthController.refresh);
router.get('/me', requireAuth, AuthController.getMe);

export default router;
