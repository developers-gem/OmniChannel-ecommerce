import mongoose, { Document } from 'mongoose';
export interface IAuditLogDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
    action: string;
    entityType: string;
    entityId: string;
    changes?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
}
export declare const AuditLog: mongoose.Model<IAuditLogDocument, {}, {}, {}, mongoose.Document<unknown, {}, IAuditLogDocument, {}, {}> & IAuditLogDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=AuditLog.d.ts.map