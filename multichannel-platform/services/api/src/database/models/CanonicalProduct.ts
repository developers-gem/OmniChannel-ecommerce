import mongoose, { Schema, Document } from 'mongoose';
import { ProductStatus } from '@multichannel/shared';

export interface ICanonicalProductDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  title: string;
  masterSku: string;
  description?: string;
  brand?: string;
  category?: string;
  tags: string[];
  images: {
    url: string;
    altText?: string;
    position?: number;
    isPrimary?: boolean;
  }[];
  status: ProductStatus;
  defaultCostPrice: number;
  defaultRetailPrice: number;
  totalVariants: number;
  createdAt: Date;
  updatedAt: Date;
}


const CanonicalProductSchema = new Schema<ICanonicalProductDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    masterSku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    brand: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      trim: true,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    images: {
      type: [
        {
          _id: false,
          url: { type: String, required: true },
          altText: { type: String, default: '' },
          position: { type: Number, default: 0 },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      set: function (val: any) {
        if (!val) return [];
        const arr = Array.isArray(val) ? val : [val];
        return arr
          .map((item: any, idx: number) => {
            if (typeof item === 'string') {
              return { url: item, altText: '', position: idx, isPrimary: idx === 0 };
            }
            if (item && typeof item === 'object') {
              return {
                url: item.url || item.src || '',
                altText: item.altText || item.alt || '',
                position: typeof item.position === 'number' ? item.position : idx,
                isPrimary: item.isPrimary ?? idx === 0,
              };
            }
            return null;
          })
          .filter((img: any) => img && typeof img.url === 'string' && img.url.trim().length > 0);
      },
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(ProductStatus),
      default: ProductStatus.ACTIVE,
      index: true,
    },
    defaultCostPrice: {
      type: Number,
      default: 0,
    },
    defaultRetailPrice: {
      type: Number,
      default: 0,
    },
    totalVariants: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

CanonicalProductSchema.index({ organizationId: 1, masterSku: 1 }, { unique: true });
CanonicalProductSchema.index({ organizationId: 1, title: 'text', brand: 'text', category: 'text' });

export const CanonicalProduct = mongoose.model<ICanonicalProductDocument>(
  'CanonicalProduct',
  CanonicalProductSchema
);
