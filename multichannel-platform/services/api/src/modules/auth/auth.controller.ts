import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, Organization, Membership } from '../../database/models';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { UserRole, MembershipStatus } from '@multichannel/shared';
import { logger } from '../../utils/logger';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName, organizationName } = req.body;

      const existingUser = await User.findOne({ email: email.toLowerCase() });
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
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create User
      const user = await User.create({
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
      const org = await Organization.create({
        name: organizationName,
        slug: uniqueSlug,
      });

      // Create Membership as OWNER
      const membership = await Membership.create({
        organizationId: org._id,
        userId: user._id,
        role: UserRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });

      const claims = {
        userId: user._id.toString(),
        email: user.email,
        organizationId: org._id.toString(),
        role: membership.role,
      };

      const accessToken = signAccessToken(claims);
      const refreshToken = signRefreshToken(user._id.toString());

      logger.info(`User registered successfully: ${user.email} (Org: ${org.name})`);

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
    } catch (error: any) {
      logger.error('Registration failed:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Registration failed' },
      });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
        });
      }

      // Fetch active membership
      const membership = await Membership.findOne({
        userId: user._id,
        status: MembershipStatus.ACTIVE,
      }).populate('organizationId');

      if (!membership || !membership.organizationId) {
        return res.status(403).json({
          success: false,
          error: { message: 'No active organization found for user', code: 'NO_ACTIVE_ORG' },
        });
      }

      const org = membership.organizationId as any;

      user.lastLoginAt = new Date();
      await user.save();

      const claims = {
        userId: user._id.toString(),
        email: user.email,
        organizationId: org._id.toString(),
        role: membership.role,
      };

      const accessToken = signAccessToken(claims);
      const refreshToken = signRefreshToken(user._id.toString());

      logger.info(`User logged in: ${user.email} (Org: ${org.name})`);

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
    } catch (error: any) {
      logger.error('Login failed:', error);
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Login failed' },
      });
    }
  }

  static async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      const { userId } = verifyRefreshToken(refreshToken);

      const user = await User.findById(userId);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: { message: 'User not active or found', code: 'UNAUTHORIZED' },
        });
      }

      const membership = await Membership.findOne({
        userId: user._id,
        status: MembershipStatus.ACTIVE,
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

      const newAccessToken = signAccessToken(claims);
      const newRefreshToken = signRefreshToken(user._id.toString());

      return res.json({
        success: true,
        data: {
          tokens: {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          },
        },
      });
    } catch (error: any) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' },
      });
    }
  }

  static async getMe(req: Request, res: Response) {
    try {
      const user = await User.findById(req.user!.userId).select('-passwordHash');
      const org = await Organization.findById(req.user!.organizationId);
      const membership = await Membership.findOne({
        userId: req.user!.userId,
        organizationId: req.user!.organizationId,
      });

      return res.json({
        success: true,
        data: {
          user,
          organization: org,
          role: membership?.role,
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to fetch user profile' },
      });
    }
  }
}
