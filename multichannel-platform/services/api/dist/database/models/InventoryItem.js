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
exports.InventoryItem = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const InventoryItemSchema = new mongoose_1.Schema({
    organizationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    canonicalVariantId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ProductVariant',
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
    trackedStock: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    reservedStock: {
        type: Number,
        default: 0,
        min: 0,
    },
    safetyStock: {
        type: Number,
        default: 0,
        min: 0,
    },
    availableToAllocate: {
        type: Number,
        default: 0,
    },
    lowStockThreshold: {
        type: Number,
        default: 5,
    },
    location: {
        type: String,
        default: 'Default Warehouse',
    },
    version: {
        type: Number,
        default: 0,
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
InventoryItemSchema.index({ organizationId: 1, canonicalVariantId: 1 }, { unique: true });
InventoryItemSchema.index({ organizationId: 1, sku: 1 });
// Automatically compute availableToAllocate before save
InventoryItemSchema.pre('save', function (next) {
    this.availableToAllocate = Math.max(0, this.trackedStock - this.reservedStock - this.safetyStock);
    next();
});
exports.InventoryItem = mongoose_1.default.model('InventoryItem', InventoryItemSchema);
//# sourceMappingURL=InventoryItem.js.map