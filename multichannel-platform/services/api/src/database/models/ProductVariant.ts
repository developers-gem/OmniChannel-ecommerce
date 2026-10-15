import mongoose, { Schema, Document } from 'mongoose';

export interface IProductVariantDocument extends Document {
  organizationId: mongoose.Types.ObjectId;
  canonicalProductId: mongoose.Types.ObjectId;
  sku: string;
  barcode?: string;
  title: string;
  options: {
    name: string;
    value: string;
  }[];
  costPrice: number;
  retailPrice: number;
  compareAtPrice?: number;
  weight?: number;
  weightUnit?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProductVariantSchema = new Schema<IProductVariantDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    canonicalProductId: {
      type: Schema.Types.ObjectId,
      ref: 'CanonicalProduct',
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    barcode: {
      type: String,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    options: [
      {
        name: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    costPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    retailPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    compareAtPrice: {
      type: Number,
    },
    weight: {
      type: Number,
    },
    weightUnit: {
      type: String,
      enum: ['g', 'kg', 'oz', 'lb'],
      default: 'lb',
    },
  },
  {
    timestamps: true,
  }
);

ProductVariantSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
ProductVariantSchema.index({ organizationId: 1, barcode: 1 }, { sparse: true });

export const ProductVariant = mongoose.model<IProductVariantDocument>(
  'ProductVariant',
  ProductVariantSchema
);
