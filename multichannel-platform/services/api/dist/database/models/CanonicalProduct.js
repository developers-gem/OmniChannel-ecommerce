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
exports.CanonicalProduct = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const shared_1 = require("@multichannel/shared");
const CanonicalProductSchema = new mongoose_1.Schema({
    organizationId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        set: function (val) {
            if (!val)
                return [];
            const arr = Array.isArray(val) ? val : [val];
            return arr
                .map((item, idx) => {
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
                .filter((img) => img && typeof img.url === 'string' && img.url.trim().length > 0);
        },
        default: [],
    },
    status: {
        type: String,
        enum: Object.values(shared_1.ProductStatus),
        default: shared_1.ProductStatus.ACTIVE,
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
    shippingCharge: {
        type: Number,
        default: 0,
    },
    totalVariants: {
        type: Number,
        default: 1,
    },
}, {
    timestamps: true,
});
CanonicalProductSchema.index({ organizationId: 1, masterSku: 1 }, { unique: true });
CanonicalProductSchema.index({ organizationId: 1, title: 'text', brand: 'text', category: 'text' });
exports.CanonicalProduct = mongoose_1.default.model('CanonicalProduct', CanonicalProductSchema);
//# sourceMappingURL=CanonicalProduct.js.map