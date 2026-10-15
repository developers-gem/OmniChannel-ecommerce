import mongoose, { Schema, Document } from 'mongoose';
import { UserRole, MembershipStatus } from '@multichannel/shared';

export interface IMembershipDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: UserRole;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembershipDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.MEMBER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MembershipStatus),
      default: MembershipStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const Membership = mongoose.model<IMembershipDocument>('Membership', MembershipSchema);
