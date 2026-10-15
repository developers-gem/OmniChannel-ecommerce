import { Request, Response } from 'express';
import { Membership, User } from '../../database/models';
import { UserRole, MembershipStatus } from '@multichannel/shared';

export class TeamsController {
  static async list(req: Request, res: Response) {
    try {
      const members = await Membership.find({
        organizationId: req.tenantId,
      })
        .populate('userId', 'email firstName lastName isActive lastLoginAt')
        .lean();

      return res.json({
        success: true,
        data: members,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to list team members' },
      });
    }
  }

  static async updateRole(req: Request, res: Response) {
    try {
      const { memberId } = req.params;
      const { role } = req.body;

      if (!Object.values(UserRole).includes(role)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid role provided' },
        });
      }

      const membership = await Membership.findOneAndUpdate(
        { _id: memberId, organizationId: req.tenantId },
        { $set: { role } },
        { new: true }
      );

      if (!membership) {
        return res.status(404).json({
          success: false,
          error: { message: 'Member not found' },
        });
      }

      return res.json({
        success: true,
        data: membership,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: { message: error.message || 'Failed to update member role' },
      });
    }
  }
}
