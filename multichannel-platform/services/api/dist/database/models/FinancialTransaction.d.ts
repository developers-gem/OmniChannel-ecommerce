import mongoose, { Document } from 'mongoose';
import { TransactionType } from '@multichannel/shared';
export interface IFinancialTransactionDocument extends Document {
    organizationId: mongoose.Types.ObjectId;
    orderId?: mongoose.Types.ObjectId;
    channelConnectionId?: mongoose.Types.ObjectId;
    type: TransactionType;
    amount: number;
    currency: string;
    date: Date;
    notes?: string;
    createdAt: Date;
}
export declare const FinancialTransaction: mongoose.Model<IFinancialTransactionDocument, {}, {}, {}, mongoose.Document<unknown, {}, IFinancialTransactionDocument, {}, {}> & IFinancialTransactionDocument & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=FinancialTransaction.d.ts.map