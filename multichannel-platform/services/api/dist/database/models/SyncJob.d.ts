import mongoose, { Document } from 'mongoose';
import { SyncJobType, SyncJobStatus } from '@multichannel/shared';
export interface ISyncJobDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    channelConnectionId?: mongoose.Types.ObjectId;
    jobType: SyncJobType;
    status: SyncJobStatus;
    bullJobId?: string;
    details?: Record<string, any>;
    errorMessage?: string;
    attemptCount: number;
    createdAt: Date;
    finishedAt?: Date;
}
export declare const SyncJob: mongoose.Model<ISyncJobDocument, {}, {}, {}, mongoose.Document<unknown, {}, ISyncJobDocument, {}, {}> & ISyncJobDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=SyncJob.d.ts.map