# Database Architecture & Mongoose Data Models

This document outlines the 20 core Mongoose schemas required by the Multichannel Ecommerce Management Platform. All collections are strictly isolated by `organizationId`.

---

## 1. Authentication & Tenancy Models

### 1.1 `User`
Stores system users across organizations.
- `_id`: ObjectId
- `email`: String (lowercase, trimmed, unique, indexed)
- `passwordHash`: String (bcrypt / argon2)
- `firstName`: String
- `lastName`: String
- `isActive`: Boolean (default: true)
- `lastLoginAt`: Date
- `createdAt`, `updatedAt`: Timestamps

### 1.2 `Organization`
The tenant entity.
- `_id`: ObjectId
- `name`: String
- `slug`: String (unique, indexed)
- `defaultCurrency`: String (USD, EUR, GBP, etc., default: USD)
- `timezone`: String (default: UTC)
- `settings`: Object (inventory policies, webhook settings)
- `createdAt`, `updatedAt`: Timestamps

### 1.3 `Membership`
Maps Users to Organizations with specific RBAC roles.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `userId`: ObjectId (ref: User, indexed)
- `role`: Enum [`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`]
- `status`: Enum [`ACTIVE`, `INVITED`, `SUSPENDED`]
- **Compound Index**: `{ organizationId: 1, userId: 1 }` (unique)

---

## 2. Channel Integration Models

### 2.1 `ChannelConnection`
Maintains authorized store credentials and sync states.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `channelType`: Enum [`SHOPIFY`, `EBAY`, `CUSTOM_STORE`]
- `name`: String (e.g. "US Main Shopify Store")
- `status`: Enum [`ACTIVE`, `DISCONNECTED`, `ERROR`, `REAUTH_REQUIRED`, `INITIALIZING`]
- `credentials`: Object (Encrypted AES-256-GCM tokens, apiKey, secret, accessToken, refreshToken, tokenExpiresAt)
- `config`: Object (storeDomain, ebayEnvironment, customBaseUrl, customHeaders)
- `syncSettings`: Object (autoSyncInventory, autoSyncPrices, autoImportOrders, syncIntervalMinutes)
- `lastSyncAt`: Date
- `lastError`: Object (message, timestamp, code)
- **Compound Index**: `{ organizationId: 1, channelType: 1, "config.storeDomain": 1 }`

---

## 3. Product Catalog & Mapping Models

### 3.1 `CanonicalProduct`
The master platform product.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `title`: String
- `masterSku`: String (indexed)
- `description`: String (rich text / markdown)
- `brand`: String
- `category`: String
- `tags`: [String]
- `images`: [{ url: String, altText: String, position: Number, isPrimary: Boolean }]
- `status`: Enum [`DRAFT`, `ACTIVE`, `ARCHIVED`]
- `defaultCostPrice`: Number
- `defaultRetailPrice`: Number
- `totalVariants`: Number (default: 1)
- `createdAt`, `updatedAt`: Timestamps
- **Compound Index**: `{ organizationId: 1, masterSku: 1 }` (unique)

### 3.2 `ProductVariant`
Master variant attached to a canonical product.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `canonicalProductId`: ObjectId (ref: CanonicalProduct, indexed)
- `sku`: String (indexed)
- `barcode`: String (UPC, EAN, ISBN, indexed)
- `title`: String
- `options`: [{ name: String, value: String }] (e.g., Size: XL, Color: Navy)
- `costPrice`: Number
- `retailPrice`: Number
- `compareAtPrice`: Number
- `weight`: Number
- `weightUnit`: Enum [`g`, `kg`, `oz`, `lb`]
- **Compound Index**: `{ organizationId: 1, sku: 1 }` (unique)

### 3.3 `ChannelProduct`
Raw or published listing as it exists on the remote channel.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, indexed)
- `channelType`: Enum [`SHOPIFY`, `EBAY`, `CUSTOM_STORE`]
- `externalProductId`: String (indexed)
- `externalVariantId`: String (indexed)
- `externalListingId`: String (for eBay offers/listings)
- `title`: String
- `sku`: String
- `barcode`: String
- `price`: Number
- `inventoryQuantity`: Number
- `status`: Enum [`ACTIVE`, `DRAFT`, `ENDED`, `UNPUBLISHED`, `ERROR`]
- `syncStatus`: Enum [`SYNCED`, `PENDING_PUSH`, `FAILED`, `OUT_OF_SYNC`]
- `lastSyncedAt`: Date
- `rawPayload`: Object
- **Compound Index**: `{ organizationId: 1, channelConnectionId: 1, externalProductId: 1, externalVariantId: 1 }` (unique)

### 3.4 `ProductMapping`
Associates canonical variants with remote channel variants.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `canonicalProductId`: ObjectId (ref: CanonicalProduct, indexed)
- `canonicalVariantId`: ObjectId (ref: ProductVariant, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, indexed)
- `channelProductId`: ObjectId (ref: ChannelProduct, indexed)
- `channelType`: Enum [`SHOPIFY`, `EBAY`, `CUSTOM_STORE`]
- `mappingConfidence`: Enum [`EXACT_SKU`, `EXACT_BARCODE`, `MANUAL`, `AI_SUGGESTED`]
- `syncPrice`: Boolean (default: true)
- `syncInventory`: Boolean (default: true)
- `priceModifier`: { type: Enum [`FIXED`, `PERCENTAGE`], value: Number }
- `status`: Enum [`MAPPED`, `IGNORED`, `CONFLICT`]
- **Compound Index**: `{ organizationId: 1, channelProductId: 1 }` (unique)
- **Index**: `{ organizationId: 1, canonicalVariantId: 1 }`

---

## 4. Inventory Ledger Models

### 4.1 `InventoryItem`
Real-time stock level for a canonical variant.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `canonicalVariantId`: ObjectId (ref: ProductVariant, unique, indexed)
- `sku`: String (indexed)
- `trackedStock`: Number (total physical count)
- `reservedStock`: Number (allocated to open orders)
- `safetyStock`: Number (buffer stock)
- `availableToAllocate`: Number (virtual/calculated)
- `lowStockThreshold`: Number (default: 5)
- `location`: String (e.g., "Main Warehouse")
- `version`: Number (optimistic locking)
- **Compound Index**: `{ organizationId: 1, canonicalVariantId: 1 }` (unique)

### 4.2 `InventoryAllocation`
Channel-specific allocation rules for stock distribution.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `canonicalVariantId`: ObjectId (ref: ProductVariant, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, indexed)
- `allocationType`: Enum [`SHARED_POOL`, `FIXED_QUANTITY`, `PERCENTAGE_SPLIT`]
- `allocationValue`: Number
- `channelPushedQuantity`: Number
- `lastPushedAt`: Date
- **Compound Index**: `{ organizationId: 1, canonicalVariantId: 1, channelConnectionId: 1 }` (unique)

### 4.3 `InventoryMovement`
Immutable audit log of all stock modifications.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `canonicalVariantId`: ObjectId (ref: ProductVariant, indexed)
- `changeType`: Enum [`ORDER_RESERVED`, `ORDER_FULFILLED`, `ORDER_CANCELLED`, `RESTOCK`, `MANUAL_ADJUSTMENT`, `RECONCILIATION`, `RETURN_RESTOCK`]
- `quantityChanged`: Number (positive or negative)
- `previousTrackedStock`: Number
- `newTrackedStock`: Number
- `reason`: String
- `referenceId`: String (e.g. Order ID, Import Job ID)
- `performedBy`: ObjectId (ref: User, nullable)
- `createdAt`: Date (indexed)

---

## 5. Orders & Fulfillment Models

### 5.1 `Order`
Centralized multi-channel customer order.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, indexed)
- `channelType`: Enum [`SHOPIFY`, `EBAY`, `CUSTOM_STORE`]
- `externalOrderId`: String (indexed)
- `orderNumber`: String
- `customer`: { name: String, email: String, phone: String }
- `shippingAddress`: Object
- `financialStatus`: Enum [`PAID`, `PENDING`, `REFUNDED`, `PARTIALLY_REFUNDED`, `VOIDED`]
- `fulfillmentStatus`: Enum [`UNFULFILLED`, `PARTIALLY_FULFILLED`, `FULFILLED`, `CANCELLED`]
- `currency`: String
- `subtotalPrice`: Number
- `totalDiscount`: Number
- `totalShipping`: Number
- `totalTax`: Number
- `totalPrice`: Number
- `channelFee`: Number
- `placedAt`: Date (indexed)
- `processedAt`: Date
- `createdAt`, `updatedAt`: Timestamps
- **Compound Index**: `{ organizationId: 1, channelConnectionId: 1, externalOrderId: 1 }` (unique)

### 5.2 `OrderLine`
Individual item line within an order.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `orderId`: ObjectId (ref: Order, indexed)
- `canonicalProductId`: ObjectId (ref: CanonicalProduct, nullable)
- `canonicalVariantId`: ObjectId (ref: ProductVariant, nullable)
- `sku`: String
- `title`: String
- `quantity`: Number
- `unitPrice`: Number
- `unitCost`: Number (frozen at purchase time for PnL COGS)
- `totalDiscount`: Number
- `taxAmount`: Number
- `externalLineId`: String

### 5.3 `Fulfillment`
Fulfillment and carrier tracking record.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `orderId`: ObjectId (ref: Order, indexed)
- `trackingCompany`: String
- `trackingNumber`: String
- `trackingUrl`: String
- `status`: Enum [`PENDING`, `IN_TRANSIT`, `DELIVERED`, `FAILURE`]
- `externalFulfillmentId`: String
- `lineItemIds`: [ObjectId]

---

## 6. Financial & PnL Analytics Models

### 6.1 `FinancialTransaction`
Ledger of revenue, fees, and expenses for financial accounting.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `orderId`: ObjectId (ref: Order, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, indexed)
- `type`: Enum [`SALE_REVENUE`, `MARKETPLACE_FEE`, `PAYMENT_PROCESSING_FEE`, `SHIPPING_COST`, `REFUND`, `DISCOUNT`, `ADJUSTMENT`]
- `amount`: Number (positive or negative)
- `currency`: String
- `date`: Date (indexed)
- `notes`: String

### 6.2 `ProductCostHistory`
Historical record of variant costs over time for FIFO/exact historical COGS.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `canonicalVariantId`: ObjectId (ref: ProductVariant, indexed)
- `costPrice`: Number
- `effectiveFrom`: Date (indexed)
- `effectiveTo`: Date (nullable, null indicates current cost)
- `reason`: String (e.g., "Supplier price increase")

---

## 7. Jobs, Audits & Notifications Models

### 7.1 `CsvImportJob`
Tracks CSV import sessions and row-level outcomes.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `fileName`: String
- `fileSize`: Number
- `status`: Enum [`PENDING`, `PARSING`, `VALIDATING`, `IMPORTING`, `COMPLETED`, `FAILED`]
- `totalRows`: Number
- `processedRows`: Number
- `successfulRows`: Number
- `failedRows`: Number
- `mappingConfig`: Object (CSV column to field mappings)
- `errors`: [{ row: Number, sku: String, error: String }]
- `createdAt`, `completedAt`: Timestamps

### 7.2 `SyncJob`
Audit log of BullMQ async sync jobs.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, nullable)
- `jobType`: Enum [`CATALOG_IMPORT`, `PRODUCT_SYNC`, `PRICE_SYNC`, `INVENTORY_SYNC`, `ORDER_IMPORT`, `CSV_PROCESS`, `RECONCILIATION`]
- `status`: Enum [`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`]
- `bullJobId`: String
- `details`: Object
- `errorMessage`: String
- `attemptCount`: Number
- `createdAt`, `finishedAt`: Timestamps

### 7.3 `WebhookEvent`
Raw incoming webhook deduplication and replay protection.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `channelConnectionId`: ObjectId (ref: ChannelConnection, indexed)
- `channelType`: Enum [`SHOPIFY`, `EBAY`, `CUSTOM_STORE`]
- `topic`: String (e.g., "products/update", "orders/create")
- `eventId`: String (indexed)
- `status`: Enum [`RECEIVED`, `PROCESSED`, `IGNORED_DUPLICATE`, `FAILED`]
- `payload`: Object
- `processedAt`: Date
- **Compound Index**: `{ organizationId: 1, channelType: 1, eventId: 1 }` (unique)

### 7.4 `Notification`
User & system alert notifications.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `title`: String
- `message`: String
- `severity`: Enum [`INFO`, `SUCCESS`, `WARNING`, `CRITICAL`]
- `category`: Enum [`INVENTORY`, `SYNC`, `ORDER`, `INTEGRATION`, `SYSTEM`]
- `isRead`: Boolean (default: false)
- `link`: String
- `createdAt`: Date (indexed)

### 7.5 `AuditLog`
Security and administrative compliance ledger.
- `_id`: ObjectId
- `organizationId`: ObjectId (ref: Organization, indexed)
- `userId`: ObjectId (ref: User, nullable)
- `action`: String (e.g. "PRODUCT_MAPPED", "INVENTORY_OVERRIDE", "CHANNEL_DISCONNECTED")
- `entityType`: String
- `entityId`: String
- `changes`: Object
- `ipAddress`: String
- `userAgent`: String
- `createdAt`: Date (indexed)
