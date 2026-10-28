import mongoose, { Document } from 'mongoose';
import { UserRole, MembershipStatus } from '@multichannel/shared';
export interface IMembershipDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    role: UserRole;
    status: MembershipStatus;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Membership: mongoose.Model<IMembershipDocument, {}, {}, {}, mongoose.Document<unknown, {}, IMembershipDocument, {}, {}> & IMembershipDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Membership.d.ts.map