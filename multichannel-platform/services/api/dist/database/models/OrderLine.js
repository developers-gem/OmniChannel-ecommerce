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
exports.OrderLine = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const OrderLineSchema = new mongoose_1.Schema({
    organizationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    orderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true,
    },
    canonicalProductId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'CanonicalProduct',
        index: true,
    },
    canonicalVariantId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ProductVariant',
        index: true,
    },
    sku: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    unitPrice: {
        type: Number,
        required: true,
        default: 0,
    },
    unitCost: {
        type: Number,
        required: true,
        default: 0,
    },
    totalDiscount: {
        type: Number,
        default: 0,
    },
    taxAmount: {
        type: Number,
        default: 0,
    },
    externalLineId: {
        type: String,
    },
}, {
    timestamps: true,
});
OrderLineSchema.index({ organizationId: 1, orderId: 1 });
OrderLineSchema.index({ organizationId: 1, canonicalVariantId: 1 });
exports.OrderLine = mongoose_1.default.model('OrderLine', OrderLineSchema);
//# sourceMappingURL=OrderLine.js.map