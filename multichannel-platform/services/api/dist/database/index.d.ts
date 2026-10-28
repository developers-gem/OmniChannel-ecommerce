import mongoose from 'mongoose';
export declare function connectDatabase(uri?: string): Promise<typeof mongoose>;
export declare function disconnectDatabase(): Promise<void>;
export declare function isTransactionSupported(): boolean;
export declare function runInTransaction<T>(callback: (session: mongoose.ClientSession | null) => Promise<T>): Promise<T>;
//# sourceMappingURL=index.d.ts.map