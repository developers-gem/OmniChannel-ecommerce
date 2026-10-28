import { z } from 'zod';
import { ChannelType } from '../enums';
export declare const RegisterSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    organizationName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
}, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organizationName: string;
}>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const RefreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export declare const CreateProductSchema: z.ZodObject<{
    title: z.ZodString;
    masterSku: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    brand: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    defaultCostPrice: z.ZodDefault<z.ZodNumber>;
    defaultRetailPrice: z.ZodDefault<z.ZodNumber>;
    defaultInitialStock: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    variants: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        sku: z.ZodString;
        barcode: z.ZodOptional<z.ZodString>;
        title: z.ZodString;
        options: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            value: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: string;
            name: string;
        }, {
            value: string;
            name: string;
        }>, "many">>;
        costPrice: z.ZodNumber;
        retailPrice: z.ZodNumber;
        compareAtPrice: z.ZodOptional<z.ZodNumber>;
        initialStock: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        sku: string;
        costPrice: number;
        retailPrice: number;
        initialStock: number;
        options?: {
            value: string;
            name: string;
        }[] | undefined;
        barcode?: string | undefined;
        compareAtPrice?: number | undefined;
    }, {
        title: string;
        sku: string;
        costPrice: number;
        retailPrice: number;
        options?: {
            value: string;
            name: string;
        }[] | undefined;
        barcode?: string | undefined;
        compareAtPrice?: number | undefined;
        initialStock?: number | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    masterSku: string;
    defaultCostPrice: number;
    defaultRetailPrice: number;
    variants: {
        title: string;
        sku: string;
        costPrice: number;
        retailPrice: number;
        initialStock: number;
        options?: {
            value: string;
            name: string;
        }[] | undefined;
        barcode?: string | undefined;
        compareAtPrice?: number | undefined;
    }[];
    description?: string | undefined;
    brand?: string | undefined;
    category?: string | undefined;
    tags?: string[] | undefined;
    defaultInitialStock?: number | undefined;
}, {
    title: string;
    masterSku: string;
    description?: string | undefined;
    brand?: string | undefined;
    category?: string | undefined;
    tags?: string[] | undefined;
    defaultCostPrice?: number | undefined;
    defaultRetailPrice?: number | undefined;
    defaultInitialStock?: number | undefined;
    variants?: {
        title: string;
        sku: string;
        costPrice: number;
        retailPrice: number;
        options?: {
            value: string;
            name: string;
        }[] | undefined;
        barcode?: string | undefined;
        compareAtPrice?: number | undefined;
        initialStock?: number | undefined;
    }[] | undefined;
}>;
export declare const UpdateInventorySchema: z.ZodObject<{
    trackedStock: z.ZodOptional<z.ZodNumber>;
    safetyStock: z.ZodOptional<z.ZodNumber>;
    retailPrice: z.ZodOptional<z.ZodNumber>;
    costPrice: z.ZodOptional<z.ZodNumber>;
    shippingCharge: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: string | undefined;
    costPrice?: number | undefined;
    retailPrice?: number | undefined;
    trackedStock?: number | undefined;
    safetyStock?: number | undefined;
    shippingCharge?: number | undefined;
    reason?: string | undefined;
}, {
    status?: string | undefined;
    costPrice?: number | undefined;
    retailPrice?: number | undefined;
    trackedStock?: number | undefined;
    safetyStock?: number | undefined;
    shippingCharge?: number | undefined;
    reason?: string | undefined;
}>;
export declare const CreateChannelConnectionSchema: z.ZodObject<{
    channelType: z.ZodNativeEnum<typeof ChannelType>;
    name: z.ZodString;
    config: z.ZodRecord<z.ZodString, z.ZodAny>;
    credentials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    channelType: ChannelType;
    config: Record<string, any>;
    credentials?: Record<string, any> | undefined;
}, {
    name: string;
    channelType: ChannelType;
    config: Record<string, any>;
    credentials?: Record<string, any> | undefined;
}>;
export declare const MapProductSchema: z.ZodObject<{
    canonicalVariantId: z.ZodString;
    channelProductId: z.ZodString;
    syncPrice: z.ZodDefault<z.ZodBoolean>;
    syncInventory: z.ZodDefault<z.ZodBoolean>;
    priceModifier: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["FIXED", "PERCENTAGE"]>;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        type: "FIXED" | "PERCENTAGE";
    }, {
        value: number;
        type: "FIXED" | "PERCENTAGE";
    }>>;
}, "strip", z.ZodTypeAny, {
    canonicalVariantId: string;
    channelProductId: string;
    syncPrice: boolean;
    syncInventory: boolean;
    priceModifier?: {
        value: number;
        type: "FIXED" | "PERCENTAGE";
    } | undefined;
}, {
    canonicalVariantId: string;
    channelProductId: string;
    syncPrice?: boolean | undefined;
    syncInventory?: boolean | undefined;
    priceModifier?: {
        value: number;
        type: "FIXED" | "PERCENTAGE";
    } | undefined;
}>;
//# sourceMappingURL=index.d.ts.map