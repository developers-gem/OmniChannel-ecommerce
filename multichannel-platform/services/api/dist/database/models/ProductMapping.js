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
exports.ProductMapping = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const shared_1 = require("@multichannel/shared");
const ProductMappingSchema = new mongoose_1.Schema({
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
    canonicalVariantId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        required: true,
        index: true,
    },
    channelConnectionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ChannelConnection',
        required: true,
        index: true,
    },
    channelProductId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ChannelProduct',
        required: true,
        index: true,
    },
    channelType: {
        type: String,
        enum: Object.values(shared_1.ChannelType),
        required: true,
        index: true,
    },
    mappingConfidence: {
        type: String,
        enum: Object.values(shared_1.MappingConfidence),
        default: shared_1.MappingConfidence.EXACT_SKU,
    },
    syncPrice: {
        type: Boolean,
        default: true,
    },
    syncInventory: {
        type: Boolean,
        default: true,
    },
    priceModifier: {
        type: {
            type: String,
            enum: ['FIXED', 'PERCENTAGE'],
        },
        value: {
            type: Number,
        },
    },
    status: {
        type: String,
        enum: Object.values(shared_1.MappingStatus),
        default: shared_1.MappingStatus.MAPPED,
        index: true,
    },
    unmappedAt: {
        type: Date,
    },
    unmappedReason: {
        type: String,
    },
}, {
    timestamps: true,
});
ProductMappingSchema.index({
    organizationId: 1,
    channelProductId: 1,
}, { unique: true });
ProductMappingSchema.index({ organizationId: 1, canonicalVariantId: 1 });
ProductMappingSchema.index({ organizationId: 1, status: 1 });
exports.ProductMapping = mongoose_1.default.model('ProductMapping', ProductMappingSchema);
//# sourceMappingURL=ProductMapping.js.map