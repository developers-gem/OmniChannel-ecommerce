import mongoose, { Document } from 'mongoose';
import { CsvJobStatus } from '@multichannel/shared';
export interface ICsvImportJobDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    fileName: string;
    fileSize: number;
    status: CsvJobStatus;
    totalRows: number;
    processedRows: number;
    successfulRows: number;
    failedRows: number;
    mappingConfig: Record<string, string>;
    destinationChannels: string[];
    rowErrors: {
        row: number;
        sku?: string;
        error: string;
    }[];
    createdAt: Date;
    completedAt?: Date;
}
export declare const CsvImportJob: mongoose.Model<ICsvImportJobDocument, {}, {}, {}, mongoose.Document<unknown, {}, ICsvImportJobDocument, {}, {}> & ICsvImportJobDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=CsvImportJob.d.ts.map