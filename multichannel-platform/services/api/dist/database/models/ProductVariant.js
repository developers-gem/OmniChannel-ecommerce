"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductVariant = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ProductVariantSchema = new mongoose_1.Schema({
    organizationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    canonicalProductId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
    shippingCharge: {
        type: Number,
        default: 0,
    },
    isDataChanged: {
        type: Boolean,
        default: false,
    },
    lastSyncedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
ProductVariantSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
ProductVariantSchema.index({ organizationId: 1, barcode: 1 }, { sparse: true });
exports.ProductVariant = mongoose_1.default.model('ProductVariant', ProductVariantSchema);
//# sourceMappingURL=ProductVariant.js.map