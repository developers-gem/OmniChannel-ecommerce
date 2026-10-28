export declare enum ChannelType {
    SHOPIFY = "SHOPIFY",
    EBAY = "EBAY",
    CUSTOM_STORE = "CUSTOM_STORE"
}
export declare enum ChannelStatus {
    ACTIVE = "ACTIVE",
    DISCONNECTED = "DISCONNECTED",
    ERROR = "ERROR",
    REAUTH_REQUIRED = "REAUTH_REQUIRED",
    INITIALIZING = "INITIALIZING"
}
export declare enum UserRole {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MANAGER = "MANAGER",
    MEMBER = "MEMBER",
    VIEWER = "VIEWER"
}
export declare enum MembershipStatus {
    ACTIVE = "ACTIVE",
    INVITED = "INVITED",
    SUSPENDED = "SUSPENDED"
}
export declare enum ProductStatus {
    DRAFT = "DRAFT",
    ACTIVE = "ACTIVE",
    ARCHIVED = "ARCHIVED"
}
export declare enum ChannelProductStatus {
    ACTIVE = "ACTIVE",
    DRAFT = "DRAFT",
    ENDED = "ENDED",
    UNPUBLISHED = "UNPUBLISHED",
    ERROR = "ERROR"
}
export declare enum SyncStatus {
    SYNCED = "SYNCED",
    PENDING_PUSH = "PENDING_PUSH",
    FAILED = "FAILED",
    OUT_OF_SYNC = "OUT_OF_SYNC"
}
export declare enum MappingConfidence {
    EXACT_SKU = "EXACT_SKU",
    EXACT_BARCODE = "EXACT_BARCODE",
    MANUAL = "MANUAL",
    AI_SUGGESTED = "AI_SUGGESTED"
}
export declare enum MappingStatus {
    MAPPED = "MAPPED",
    UNMAPPED = "UNMAPPED",
    IGNORED = "IGNORED",
    CONFLICT = "CONFLICT"
}
export declare enum AllocationType {
    SHARED_POOL = "SHARED_POOL",
    FIXED_QUANTITY = "FIXED_QUANTITY",
    PERCENTAGE_SPLIT = "PERCENTAGE_SPLIT"
}
export declare enum InventoryChangeType {
    ORDER_RESERVED = "ORDER_RESERVED",
    ORDER_FULFILLED = "ORDER_FULFILLED",
    ORDER_CANCELLED = "ORDER_CANCELLED",
    RESTOCK = "RESTOCK",
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
    RECONCILIATION = "RECONCILIATION",
    RETURN_RESTOCK = "RETURN_RESTOCK"
}
export declare enum OrderFinancialStatus {
    PAID = "PAID",
    PENDING = "PENDING",
    REFUNDED = "REFUNDED",
    PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
    VOIDED = "VOIDED"
}
export declare enum OrderFulfillmentStatus {
    UNFULFILLED = "UNFULFILLED",
    PARTIALLY_FULFILLED = "PARTIALLY_FULFILLED",
    FULFILLED = "FULFILLED",
    CANCELLED = "CANCELLED"
}
export declare enum TransactionType {
    SALE_REVENUE = "SALE_REVENUE",
    MARKETPLACE_FEE = "MARKETPLACE_FEE",
    PAYMENT_PROCESSING_FEE = "PAYMENT_PROCESSING_FEE",
    SHIPPING_COST = "SHIPPING_COST",
    REFUND = "REFUND",
    DISCOUNT = "DISCOUNT",
    ADJUSTMENT = "ADJUSTMENT"
}
export declare enum CsvJobStatus {
    PENDING = "PENDING",
    PARSING = "PARSING",
    VALIDATING = "VALIDATING",
    IMPORTING = "IMPORTING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export declare enum SyncJobType {
    CATALOG_IMPORT = "CATALOG_IMPORT",
    PRODUCT_SYNC = "PRODUCT_SYNC",
    PRICE_SYNC = "PRICE_SYNC",
    INVENTORY_SYNC = "INVENTORY_SYNC",
    ORDER_IMPORT = "ORDER_IMPORT",
    CSV_PROCESS = "CSV_PROCESS",
    RECONCILIATION = "RECONCILIATION"
}
export declare enum SyncJobStatus {
    QUEUED = "QUEUED",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export declare enum NotificationSeverity {
    INFO = "INFO",
    SUCCESS = "SUCCESS",
    WARNING = "WARNING",
    CRITICAL = "CRITICAL"
}
export declare enum NotificationCategory {
    INVENTORY = "INVENTORY",
    SYNC = "SYNC",
    ORDER = "ORDER",
    INTEGRATION = "INTEGRATION",
    SYSTEM = "SYSTEM"
}
//# sourceMappingURL=index.d.ts.map