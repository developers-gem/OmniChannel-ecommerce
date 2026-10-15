import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganizationDocument extends Document {
  name: string;
  slug: string;
  defaultCurrency: string;
  timezone: string;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganizationDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    defaultCurrency: {
      type: String,
      default: 'USD',
      trim: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    settings: {
      type: Schema.Types.Mixed,
      default: {
        safetyStockDefault: 2,
        autoSyncInventory: true,
        autoSyncPrices: true,
        preventOversell: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

export const Organization = mongoose.model<IOrganizationDocument>('Organization', OrganizationSchema);
