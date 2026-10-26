import { z } from 'zod';
import { ChannelType, UserRole, AllocationType } from '../enums';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const CreateProductSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  masterSku: z.string().min(1, 'SKU is required'),
  description: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  defaultCostPrice: z.number().nonnegative().default(0),
  defaultRetailPrice: z.number().nonnegative().default(0),
  defaultInitialStock: z.number().int().nonnegative().default(0).optional(),
  variants: z.array(
    z.object({
      sku: z.string().min(1),
      barcode: z.string().optional(),
      title: z.string().min(1),
      options: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
      costPrice: z.number().nonnegative(),
      retailPrice: z.number().nonnegative(),
      compareAtPrice: z.number().optional(),
      initialStock: z.number().int().nonnegative().default(0),
    })
  ).optional().default([]),
});

export const UpdateInventorySchema = z.object({
  trackedStock: z.number().int().nonnegative().optional(),
  safetyStock: z.number().int().nonnegative().optional(),
  retailPrice: z.number().nonnegative().optional(),
  costPrice: z.number().nonnegative().optional(),
  shippingCharge: z.number().nonnegative().optional(),
  status: z.string().optional(),
  reason: z.string().optional(),
});

export const CreateChannelConnectionSchema = z.object({
  channelType: z.nativeEnum(ChannelType),
  name: z.string().min(1),
  config: z.record(z.any()),
  credentials: z.record(z.any()).optional(),
});

export const MapProductSchema = z.object({
  canonicalVariantId: z.string().min(1),
  channelProductId: z.string().min(1),
  syncPrice: z.boolean().default(true),
  syncInventory: z.boolean().default(true),
  priceModifier: z
    .object({
      type: z.enum(['FIXED', 'PERCENTAGE']),
      value: z.number(),
    })
    .optional(),
});
