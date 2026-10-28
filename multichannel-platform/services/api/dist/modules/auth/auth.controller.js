"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const models_1 = require("../../database/models");
const jwt_1 = require("../../utils/jwt");
const shared_1 = require("@multichannel/shared");
const logger_1 = require("../../utils/logger");
class AuthController {
    static async register(req, res) {
        try {
            const { email, password, firstName, lastName, organizationName } = req.body;
            const existingUser = await models_1.User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    error: {
                        message: 'User with this email already exists',
                        code: 'EMAIL_ALREADY_EXISTS',
                    },
                });
            }
            // Hash password
            const salt = await bcryptjs_1.default.genSalt(10);
            const passwordHash = await bcryptjs_1.default.hash(password, salt);
            // Create User
            const user = await models_1.User.create({
                email: email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
            });
            // Generate unique slug for organization
            const baseSlug = organizationName
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
            const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
            // Create Organization
            const org = await models_1.Organization.create({
                name: organizationName,
                slug: uniqueSlug,
            });
            // Create Membership as OWNER
            const membership = await models_1.Membership.create({
                organizationId: org._id,
                userId: user._id,
                role: shared_1.UserRole.OWNER,
                status: shared_1.MembershipStatus.ACTIVE,
            });
            const claims = {
                userId: user._id.toString(),
                email: user.email,
                organizationId: org._id.toString(),
                role: membership.role,
            };
            const accessToken = (0, jwt_1.signAccessToken)(claims);
            const refreshToken = (0, jwt_1.signRefreshToken)(user._id.toString());
            logger_1.logger.info(`User registered successfully: ${user.email} (Org: ${org.name})`);
            return res.status(201).json({
                success: true,
                data: {
                    user: {
                        id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                    },
                    organization: {
                        id: org._id,
                        name: org.name,
                        slug: org.slug,
                        role: membership.role,
                    },
                    tokens: {
                        accessToken,
                        refreshToken,
                    },
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Registration failed:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Registration failed' },
            });
        }
    }
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            const user = await models_1.User.findOne({ email: email.toLowerCase() });
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
                });
            }
            const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
                });
            }
            // Fetch active membership
            const membership = await models_1.Membership.findOne({
                userId: user._id,
                status: shared_1.MembershipStatus.ACTIVE,
            }).populate('organizationId');
            if (!membership || !membership.organizationId) {
                return res.status(403).json({
                    success: false,
                    error: { message: 'No active organization found for user', code: 'NO_ACTIVE_ORG' },
                });
            }
            const org = membership.organizationId;
            user.lastLoginAt = new Date();
            await user.save();
            const claims = {
                userId: user._id.toString(),
                email: user.email,
                organizationId: org._id.toString(),
                role: membership.role,
            };
            const accessToken = (0, jwt_1.signAccessToken)(claims);
            const refreshToken = (0, jwt_1.signRefreshToken)(user._id.toString());
            logger_1.logger.info(`User logged in: ${user.email} (Org: ${org.name})`);
            return res.json({
                success: true,
                data: {
                    user: {
                        id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                    },
                    organization: {
                        id: org._id,
                        name: org.name,
                        slug: org.slug,
                        role: membership.role,
                    },
                    tokens: {
                        accessToken,
                        refreshToken,
                    },
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Login failed:', error);
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Login failed' },
            });
        }
    }
    static async refresh(req, res) {
        try {
            const { refreshToken } = req.body;
            const { userId } = (0, jwt_1.verifyRefreshToken)(refreshToken);
            const user = await models_1.User.findById(userId);
            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    error: { message: 'User not active or found', code: 'UNAUTHORIZED' },
                });
            }
            const membership = await models_1.Membership.findOne({
                userId: user._id,
                status: shared_1.MembershipStatus.ACTIVE,
            });
            if (!membership) {
                return res.status(403).json({
                    success: false,
                    error: { message: 'No active organization membership', code: 'NO_MEMBERSHIP' },
                });
            }
            const claims = {
                userId: user._id.toString(),
                email: user.email,
                organizationId: membership.organizationId.toString(),
                role: membership.role,
            };
            const newAccessToken = (0, jwt_1.signAccessToken)(claims);
            const newRefreshToken = (0, jwt_1.signRefreshToken)(user._id.toString());
            return res.json({
                success: true,
                data: {
                    tokens: {
                        accessToken: newAccessToken,
                        refreshToken: newRefreshToken,
                    },
                },
            });
        }
        catch (error) {
            return res.status(401).json({
                success: false,
                error: { message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' },
            });
        }
    }
    static async getMe(req, res) {
        try {
            const user = await models_1.User.findById(req.user.userId).select('-passwordHash');
            const org = await models_1.Organization.findById(req.user.organizationId);
            const membership = await models_1.Membership.findOne({
                userId: req.user.userId,
                organizationId: req.user.organizationId,
            });
            return res.json({
                success: true,
                data: {
                    user,
                    organization: org,
                    role: membership?.role,
                },
            });
        }
        catch (error) {
            return res.status(500).json({
                success: false,
                error: { message: error.message || 'Failed to fetch user profile' },
            });
        }
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map