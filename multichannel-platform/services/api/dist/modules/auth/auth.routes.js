"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const validate_1 = require("../../middlewares/validate");
const auth_1 = require("../../middlewares/auth");
const shared_1 = require("@multichannel/shared");
const router = (0, express_1.Router)();
router.post('/register', (0, validate_1.validate)(shared_1.RegisterSchema), auth_controller_1.AuthController.register);
router.post('/login', (0, validate_1.validate)(shared_1.LoginSchema), auth_controller_1.AuthController.login);
router.post('/refresh', (0, validate_1.validate)(shared_1.RefreshTokenSchema), auth_controller_1.AuthController.refresh);
router.get('/me', auth_1.requireAuth, auth_controller_1.AuthController.getMe);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map