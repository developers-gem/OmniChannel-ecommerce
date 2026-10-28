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
exports.ChannelProduct = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const shared_1 = require("@multichannel/shared");
const ChannelProductSchema = new mongoose_1.Schema({
    organizationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true,
    },
    channelConnectionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ChannelConnection',
        required: true,
        index: true,
    },
    channelType: {
        type: String,
        enum: Object.values(shared_1.ChannelType),
        required: true,
        index: true,
    },
    externalProductId: {
        type: String,
        required: true,
        index: true,
    },
    externalVariantId: {
        type: String,
        default: '',
        index: true,
    },
    externalListingId: {
        type: String,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    sku: {
        type: String,
        trim: true,
        uppercase: true,
        index: true,
    },
    barcode: {
        type: String,
        trim: true,
        index: true,
    },
    price: {
        type: Number,
        default: 0,
    },
    inventoryQuantity: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: Object.values(shared_1.ChannelProductStatus),
        default: shared_1.ChannelProductStatus.ACTIVE,
        index: true,
    },
    syncStatus: {
        type: String,
        enum: Object.values(shared_1.SyncStatus),
        default: shared_1.SyncStatus.SYNCED,
        index: true,
    },
    lastSyncedAt: {
        type: Date,
    },
    rawPayload: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
});
ChannelProductSchema.index({
    organizationId: 1,
    channelConnectionId: 1,
    externalProductId: 1,
    externalVariantId: 1,
}, { unique: true });
exports.ChannelProduct = mongoose_1.default.model('ChannelProduct', ChannelProductSchema);
//# sourceMappingURL=ChannelProduct.js.map