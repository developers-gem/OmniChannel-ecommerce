"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapProductSchema = exports.CreateChannelConnectionSchema = exports.UpdateInventorySchema = exports.CreateProductSchema = exports.RefreshTokenSchema = exports.LoginSchema = exports.RegisterSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    firstName: zod_1.z.string().min(1, 'First name is required'),
    lastName: zod_1.z.string().min(1, 'Last name is required'),
    organizationName: zod_1.z.string().min(2, 'Organization name must be at least 2 characters'),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1, 'Password is required'),
});
exports.RefreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
exports.CreateProductSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Title is required'),
    masterSku: zod_1.z.string().min(1, 'SKU is required'),
    description: zod_1.z.string().optional(),
    brand: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    defaultCostPrice: zod_1.z.number().nonnegative().default(0),
    defaultRetailPrice: zod_1.z.number().nonnegative().default(0),
    defaultInitialStock: zod_1.z.number().int().nonnegative().default(0).optional(),
    variants: zod_1.z.array(zod_1.z.object({
        sku: zod_1.z.string().min(1),
        barcode: zod_1.z.string().optional(),
        title: zod_1.z.string().min(1),
        options: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string(), value: zod_1.z.string() })).optional(),
        costPrice: zod_1.z.number().nonnegative(),
        retailPrice: zod_1.z.number().nonnegative(),
        compareAtPrice: zod_1.z.number().optional(),
        initialStock: zod_1.z.number().int().nonnegative().default(0),
    })).optional().default([]),
});
exports.UpdateInventorySchema = zod_1.z.object({
    trackedStock: zod_1.z.number().int().nonnegative().optional(),
    safetyStock: zod_1.z.number().int().nonnegative().optional(),
    retailPrice: zod_1.z.number().nonnegative().optional(),
    costPrice: zod_1.z.number().nonnegative().optional(),
    shippingCharge: zod_1.z.number().nonnegative().optional(),
    status: zod_1.z.string().optional(),
    reason: zod_1.z.string().optional(),
});
exports.CreateChannelConnectionSchema = zod_1.z.object({
    channelType: zod_1.z.nativeEnum(enums_1.ChannelType),
    name: zod_1.z.string().min(1),
    config: zod_1.z.record(zod_1.z.any()),
    credentials: zod_1.z.record(zod_1.z.any()).optional(),
});
exports.MapProductSchema = zod_1.z.object({
    canonicalVariantId: zod_1.z.string().min(1),
    channelProductId: zod_1.z.string().min(1),
    syncPrice: zod_1.z.boolean().default(true),
    syncInventory: zod_1.z.boolean().default(true),
    priceModifier: zod_1.z
        .object({
        type: zod_1.z.enum(['FIXED', 'PERCENTAGE']),
        value: zod_1.z.number(),
    })
        .optional(),
});
//# sourceMappingURL=index.js.map