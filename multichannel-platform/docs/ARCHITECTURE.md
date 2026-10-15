# System Architecture & Design Specification

## 1. High-Level Overview

The platform functions as the central source of truth for an ecommerce merchant selling across multiple sales channels (Shopify, eBay, Custom REST APIs). 

```
+---------------------------------------------------------------------------------+
|                                 Next.js Web UI                                  |
|   (App Router, React, Tailwind CSS, TanStack Query, Zustand, Recharts)          |
+---------------------------------------------------------------------------------+
                                       |
                                REST / JSON (JWT)
                                       v
+---------------------------------------------------------------------------------+
|                               Express.js API                                    |
|   - Authentication & Tenant Isolation (Organization-scoped)                     |
|   - Canonical Catalog & Variant Management                                      |
|   - Channel Connector Gateways (Shopify, eBay, Custom REST)                     |
|   - Product Mapping Engine (Signal-based, exact SKU/barcode, suggestions)       |
|   - Inventory Ledger & Allocation Engine (Safety stock, oversell prevention)    |
|   - Orders & Fulfillment Sync                                                   |
|   - Profit & Loss Calculation Engine (FIFO/Historical COGS, Fees, Margins)      |
|   - Webhook Ingestion & Signature Verification (Idempotent)                     |
+---------------------------------------------------------------------------------+
       |                                          |                     |
       v                                          v                     v
+---------------+                          +---------------+    +-----------------+
|  MongoDB 7.0  |                          |   Redis 7.0   |    | External APIs   |
| (Mongoose ORM)|                          |   (BullMQ)    |    | - Shopify Admin |
| - 20 Models   |                          +---------------+    | - eBay REST     |
| - Tenant Scope|                                 |             | - Custom REST   |
+---------------+                                 v             +-----------------+
                                       +--------------------+
                                       |   BullMQ Worker    |
                                       | - Catalog Import   |
                                       | - Product Sync     |
                                       | - Inventory Sync   |
                                       | - Order Ingestion  |
                                       | - CSV Parsing/Job  |
                                       | - Scheduled Reconc.|
                                       +--------------------+
```

## 2. Core Architectural Principles

### 2.1 Canonical vs. Channel Listing Separation
A single internal `CanonicalProduct` can be mapped to multiple `ChannelProduct` records:
- **CanonicalProduct**: Platform's internal master representation (title, master SKU, description, brand, category, tags, attributes, cost price, default retail price, images).
- **ProductVariant**: Canonical variant representations with specific SKU, barcode (UPC/EAN), attributes (Size, Color), weight, and specific base price/cost.
- **ChannelProduct**: Channel-specific entity holding remote identifiers (`externalProductId`, `externalListingId`, `externalVariantId`), channel-specific titles, channel-specific price, sync status, and channel raw payload.
- **ProductMapping**: Explicit relationship associating a Canonical Variant with a Channel Listing Variant.

### 2.2 Inventory Ledger & Oversell Prevention
- We maintain an **Inventory Ledger** (`InventoryMovement`) capturing every stock adjustment, order deduction, return, and reconciliation.
- **InventoryItem** tracks:
  - `trackedStock`: physical count on hand.
  - `reservedStock`: stock committed to pending/unfulfilled orders.
  - `safetyStock`: buffer stock held back from sales channels.
  - `availableToAllocate` = $\max(0, \text{trackedStock} - \text{reservedStock} - \text{safetyStock})$.
- Allocation Policies: Shared Pool, Fixed Channel Allocation, Percentage Allocation.
- Race condition mitigation: Atomic MongoDB queries (`$inc` with conditional bounds `{ $gte: quantity }`), session transactions where applicable, and optimistic version checks.

### 2.3 Synchronization & Anti-Looping Architecture
- Every sync job is stamped with an `operationId`, `sourceChannel`, and field-level content fingerprint (SHA-256 hash).
- When a change originates from Shopify, the platform updates the canonical model and pushes changes out to eBay and Custom Stores, marking `sourceChannel: SHOPIFY`.
- If an incoming webhook for that update comes back from an external channel within the debounce window or matches the active hash fingerprint, the event is acknowledged and discarded, preventing infinite sync loops.

### 2.4 Multi-Tenancy & Security
- Strict multi-tenancy: every data model carries an `organizationId` index.
- Authenticated requests resolve user membership and attach tenant context to the Express request (`req.tenant`).
- Tenant isolation middleware guarantees no cross-tenant query execution.
- Sensitive credentials (Shopify tokens, eBay client secrets) are encrypted at rest using AES-256-GCM.
