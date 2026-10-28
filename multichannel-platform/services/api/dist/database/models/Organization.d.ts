import mongoose, { Document } from 'mongoose';
export interface IOrganizationDocument extends Document {
    name: string;
    slug: string;
    defaultCurrency: string;
    timezone: string;
    settings: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Organization: mongoose.Model<IOrganizationDocument, {}, {}, {}, mongoose.Document<unknown, {}, IOrganizationDocument, {}, {}> & IOrganizationDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Organization.d.ts.map