"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationCategory = exports.NotificationSeverity = exports.SyncJobStatus = exports.SyncJobType = exports.CsvJobStatus = exports.TransactionType = exports.OrderFulfillmentStatus = exports.OrderFinancialStatus = exports.InventoryChangeType = exports.AllocationType = exports.MappingStatus = exports.MappingConfidence = exports.SyncStatus = exports.ChannelProductStatus = exports.ProductStatus = exports.MembershipStatus = exports.UserRole = exports.ChannelStatus = exports.ChannelType = void 0;
var ChannelType;
(function (ChannelType) {
    ChannelType["SHOPIFY"] = "SHOPIFY";
    ChannelType["EBAY"] = "EBAY";
    ChannelType["CUSTOM_STORE"] = "CUSTOM_STORE";
})(ChannelType || (exports.ChannelType = ChannelType = {}));
var ChannelStatus;
(function (ChannelStatus) {
    ChannelStatus["ACTIVE"] = "ACTIVE";
    ChannelStatus["DISCONNECTED"] = "DISCONNECTED";
    ChannelStatus["ERROR"] = "ERROR";
    ChannelStatus["REAUTH_REQUIRED"] = "REAUTH_REQUIRED";
    ChannelStatus["INITIALIZING"] = "INITIALIZING";
})(ChannelStatus || (exports.ChannelStatus = ChannelStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "OWNER";
    UserRole["ADMIN"] = "ADMIN";
    UserRole["MANAGER"] = "MANAGER";
    UserRole["MEMBER"] = "MEMBER";
    UserRole["VIEWER"] = "VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
var MembershipStatus;
(function (MembershipStatus) {
    MembershipStatus["ACTIVE"] = "ACTIVE";
    MembershipStatus["INVITED"] = "INVITED";
    MembershipStatus["SUSPENDED"] = "SUSPENDED";
})(MembershipStatus || (exports.MembershipStatus = MembershipStatus = {}));
var ProductStatus;
(function (ProductStatus) {
    ProductStatus["DRAFT"] = "DRAFT";
    ProductStatus["ACTIVE"] = "ACTIVE";
    ProductStatus["ARCHIVED"] = "ARCHIVED";
})(ProductStatus || (exports.ProductStatus = ProductStatus = {}));
var ChannelProductStatus;
(function (ChannelProductStatus) {
    ChannelProductStatus["ACTIVE"] = "ACTIVE";
    ChannelProductStatus["DRAFT"] = "DRAFT";
    ChannelProductStatus["ENDED"] = "ENDED";
    ChannelProductStatus["UNPUBLISHED"] = "UNPUBLISHED";
    ChannelProductStatus["ERROR"] = "ERROR";
})(ChannelProductStatus || (exports.ChannelProductStatus = ChannelProductStatus = {}));
var SyncStatus;
(function (SyncStatus) {
    SyncStatus["SYNCED"] = "SYNCED";
    SyncStatus["PENDING_PUSH"] = "PENDING_PUSH";
    SyncStatus["FAILED"] = "FAILED";
    SyncStatus["OUT_OF_SYNC"] = "OUT_OF_SYNC";
})(SyncStatus || (exports.SyncStatus = SyncStatus = {}));
var MappingConfidence;
(function (MappingConfidence) {
    MappingConfidence["EXACT_SKU"] = "EXACT_SKU";
    MappingConfidence["EXACT_BARCODE"] = "EXACT_BARCODE";
    MappingConfidence["MANUAL"] = "MANUAL";
    MappingConfidence["AI_SUGGESTED"] = "AI_SUGGESTED";
})(MappingConfidence || (exports.MappingConfidence = MappingConfidence = {}));
var MappingStatus;
(function (MappingStatus) {
    MappingStatus["MAPPED"] = "MAPPED";
    MappingStatus["UNMAPPED"] = "UNMAPPED";
    MappingStatus["IGNORED"] = "IGNORED";
    MappingStatus["CONFLICT"] = "CONFLICT";
})(MappingStatus || (exports.MappingStatus = MappingStatus = {}));
var AllocationType;
(function (AllocationType) {
    AllocationType["SHARED_POOL"] = "SHARED_POOL";
    AllocationType["FIXED_QUANTITY"] = "FIXED_QUANTITY";
    AllocationType["PERCENTAGE_SPLIT"] = "PERCENTAGE_SPLIT";
})(AllocationType || (exports.AllocationType = AllocationType = {}));
var InventoryChangeType;
(function (InventoryChangeType) {
    InventoryChangeType["ORDER_RESERVED"] = "ORDER_RESERVED";
    InventoryChangeType["ORDER_FULFILLED"] = "ORDER_FULFILLED";
    InventoryChangeType["ORDER_CANCELLED"] = "ORDER_CANCELLED";
    InventoryChangeType["RESTOCK"] = "RESTOCK";
    InventoryChangeType["MANUAL_ADJUSTMENT"] = "MANUAL_ADJUSTMENT";
    InventoryChangeType["RECONCILIATION"] = "RECONCILIATION";
    InventoryChangeType["RETURN_RESTOCK"] = "RETURN_RESTOCK";
})(InventoryChangeType || (exports.InventoryChangeType = InventoryChangeType = {}));
var OrderFinancialStatus;
(function (OrderFinancialStatus) {
    OrderFinancialStatus["PAID"] = "PAID";
    OrderFinancialStatus["PENDING"] = "PENDING";
    OrderFinancialStatus["REFUNDED"] = "REFUNDED";
    OrderFinancialStatus["PARTIALLY_REFUNDED"] = "PARTIALLY_REFUNDED";
    OrderFinancialStatus["VOIDED"] = "VOIDED";
})(OrderFinancialStatus || (exports.OrderFinancialStatus = OrderFinancialStatus = {}));
var OrderFulfillmentStatus;
(function (OrderFulfillmentStatus) {
    OrderFulfillmentStatus["UNFULFILLED"] = "UNFULFILLED";
    OrderFulfillmentStatus["PARTIALLY_FULFILLED"] = "PARTIALLY_FULFILLED";
    OrderFulfillmentStatus["FULFILLED"] = "FULFILLED";
    OrderFulfillmentStatus["CANCELLED"] = "CANCELLED";
})(OrderFulfillmentStatus || (exports.OrderFulfillmentStatus = OrderFulfillmentStatus = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["SALE_REVENUE"] = "SALE_REVENUE";
    TransactionType["MARKETPLACE_FEE"] = "MARKETPLACE_FEE";
    TransactionType["PAYMENT_PROCESSING_FEE"] = "PAYMENT_PROCESSING_FEE";
    TransactionType["SHIPPING_COST"] = "SHIPPING_COST";
    TransactionType["REFUND"] = "REFUND";
    TransactionType["DISCOUNT"] = "DISCOUNT";
    TransactionType["ADJUSTMENT"] = "ADJUSTMENT";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var CsvJobStatus;
(function (CsvJobStatus) {
    CsvJobStatus["PENDING"] = "PENDING";
    CsvJobStatus["PARSING"] = "PARSING";
    CsvJobStatus["VALIDATING"] = "VALIDATING";
    CsvJobStatus["IMPORTING"] = "IMPORTING";
    CsvJobStatus["COMPLETED"] = "COMPLETED";
    CsvJobStatus["FAILED"] = "FAILED";
})(CsvJobStatus || (exports.CsvJobStatus = CsvJobStatus = {}));
var SyncJobType;
(function (SyncJobType) {
    SyncJobType["CATALOG_IMPORT"] = "CATALOG_IMPORT";
    SyncJobType["PRODUCT_SYNC"] = "PRODUCT_SYNC";
    SyncJobType["PRICE_SYNC"] = "PRICE_SYNC";
    SyncJobType["INVENTORY_SYNC"] = "INVENTORY_SYNC";
    SyncJobType["ORDER_IMPORT"] = "ORDER_IMPORT";
    SyncJobType["CSV_PROCESS"] = "CSV_PROCESS";
    SyncJobType["RECONCILIATION"] = "RECONCILIATION";
})(SyncJobType || (exports.SyncJobType = SyncJobType = {}));
var SyncJobStatus;
(function (SyncJobStatus) {
    SyncJobStatus["QUEUED"] = "QUEUED";
    SyncJobStatus["PROCESSING"] = "PROCESSING";
    SyncJobStatus["COMPLETED"] = "COMPLETED";
    SyncJobStatus["FAILED"] = "FAILED";
    SyncJobStatus["CANCELLED"] = "CANCELLED";
})(SyncJobStatus || (exports.SyncJobStatus = SyncJobStatus = {}));
var NotificationSeverity;
(function (NotificationSeverity) {
    NotificationSeverity["INFO"] = "INFO";
    NotificationSeverity["SUCCESS"] = "SUCCESS";
    NotificationSeverity["WARNING"] = "WARNING";
    NotificationSeverity["CRITICAL"] = "CRITICAL";
})(NotificationSeverity || (exports.NotificationSeverity = NotificationSeverity = {}));
var NotificationCategory;
(function (NotificationCategory) {
    NotificationCategory["INVENTORY"] = "INVENTORY";
    NotificationCategory["SYNC"] = "SYNC";
    NotificationCategory["ORDER"] = "ORDER";
    NotificationCategory["INTEGRATION"] = "INTEGRATION";
    NotificationCategory["SYSTEM"] = "SYSTEM";
})(NotificationCategory || (exports.NotificationCategory = NotificationCategory = {}));
//# sourceMappingURL=index.js.map