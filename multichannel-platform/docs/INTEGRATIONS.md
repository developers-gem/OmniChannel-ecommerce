# Channel Integrations Specification

This document details the protocols, security controls, and schemas for external channel connectors.

---

## 1. Shopify Integration

### 1.1 Authorization & OAuth Flow
- **Protocol**: OAuth 2.0.
- **Initiation**: `GET /api/v1/integrations/shopify/auth?shop={shop_domain}`
- **Verification**: Generates a random cryptographic `state` (stored in session/redis for 10 minutes) and HMAC parameter checks.
- **Scopes Requested**:
  - `read_products`, `write_products`
  - `read_inventory`, `write_inventory`
  - `read_orders`, `write_orders`
- **Exchange**: `POST https://{shop_domain}/admin/oauth/access_token`
- **Security**: The retrieved offline access token is encrypted using AES-256-GCM before saving in `ChannelConnection.credentials`.

### 1.2 Rate Limiting & Resilience
- Shopify Admin REST API uses a leaky bucket algorithm (40 req/bucket, 2 req/sec replenish rate).
- Inspects response headers `X-Shopify-Shop-Api-Call-Limit`. When usage exceeds 80%, worker pauses or delays request.

### 1.3 Webhooks & Verification
- Webhook endpoints: `/api/v1/webhooks/shopify`
- Signature verification: Computes SHA256 HMAC of raw body using `SHOPIFY_API_SECRET` and matches `X-Shopify-Hmac-Sha256`.
- Processed topics:
  - `products/create`, `products/update`, `products/delete`
  - `inventory_levels/set`, `inventory_levels/update`
  - `orders/create`, `orders/updated`, `orders/cancelled`

---

## 2. eBay Integration

### 2.1 OAuth 2.0 & Token Refresh
- **Auth Flow**: Uses eBay OAuth 2.0 with User Token grant.
- **Environment**: Supports both `SANDBOX` (`api.sandbox.ebay.com`) and `PRODUCTION` (`api.ebay.com`).
- **Scopes**:
  - `https://api.ebay.com/oauth/api_scope/sell.inventory`
  - `https://api.ebay.com/oauth/api_scope/sell.fulfillment`
- **Token Management**: Refresh tokens are stored encrypted and automatically renewed before expiration.

### 2.2 Inventory vs. Offers & Listings
eBay architecture separates:
1. **Inventory Items**: `PUT /sell/inventory/v1/inventory_item/{sku}` (product details, SKU, stock quantity).
2. **Offers**: `POST /sell/inventory/v1/offer` (price, marketplace ID e.g., EBAY_US, category, policy IDs).
3. **Publish Offer**: `POST /sell/inventory/v1/offer/{offerId}/publish` (creates the active live listing).

---

## 3. Custom Website Connector (REST API)

### 3.1 Connector Architecture
Allows merchants with custom WooCommerce, Magento, or in-house platforms to connect via standard REST interfaces.

### 3.2 Security Protections
- **SSRF Prevention**: URL validation blocks private/internal IPs (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`, `localhost`).
- **Redirect Limits**: Maximum 3 HTTP redirects allowed.
- **Request Timeouts**: Strict 10-second timeout on all outbound requests.
- **Authentication**: Supports `API_KEY` header, `BEARER_TOKEN`, or `BASIC_AUTH`.

### 3.3 Custom Store Standard API Contract
A compatible custom store must implement:
- `GET /api/v1/products`: Returns paginated product list (`{ data: [...], pagination: { page, totalPages, totalItems } }`).
- `PUT /api/v1/products/{id}/inventory`: Accepts `{ sku: string, quantity: number }`.
- `PUT /api/v1/products/{id}/price`: Accepts `{ sku: string, price: number }`.
- `GET /api/v1/orders`: Returns paginated orders.
- Webhook callback for events: `POST /api/v1/webhooks/custom/{connectionId}`.
