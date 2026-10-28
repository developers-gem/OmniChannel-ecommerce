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
exports.Order = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const shared_1 = require("@multichannel/shared");
const OrderSchema = new mongoose_1.Schema({
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
    externalOrderId: {
        type: String,
        required: true,
        index: true,
    },
    orderNumber: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    customer: {
        name: { type: String, default: 'Guest' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
    },
    shippingAddress: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    financialStatus: {
        type: String,
        enum: Object.values(shared_1.OrderFinancialStatus),
        default: shared_1.OrderFinancialStatus.PAID,
        index: true,
    },
    fulfillmentStatus: {
        type: String,
        enum: Object.values(shared_1.OrderFulfillmentStatus),
        default: shared_1.OrderFulfillmentStatus.UNFULFILLED,
        index: true,
    },
    currency: {
        type: String,
        default: 'USD',
    },
    subtotalPrice: {
        type: Number,
        required: true,
        default: 0,
    },
    totalDiscount: {
        type: Number,
        default: 0,
    },
    totalShipping: {
        type: Number,
        default: 0,
    },
    totalTax: {
        type: Number,
        default: 0,
    },
    totalPrice: {
        type: Number,
        required: true,
        default: 0,
    },
    channelFee: {
        type: Number,
        default: 0,
    },
    placedAt: {
        type: Date,
        required: true,
        index: true,
    },
    processedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
OrderSchema.index({
    organizationId: 1,
    channelConnectionId: 1,
    externalOrderId: 1,
}, { unique: true });
OrderSchema.index({ organizationId: 1, placedAt: -1 });
exports.Order = mongoose_1.default.model('Order', OrderSchema);
//# sourceMappingURL=Order.js.map