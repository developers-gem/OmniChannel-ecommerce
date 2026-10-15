# Multichannel Platform Implementation Plan

This roadmap outlines the phased execution of the complete multichannel ecommerce platform.

---

## Phase Execution Checklist

- [x] **Preparation**: Empty workspace verification, monorepo architecture, initial repo layout.
- [ ] **Phase 1**: Monorepo packages setup, Base configuration, Shared library, Database models & connection, Auth API, Tenant isolation, Frontend Dashboard layout with 13 core routes.
- [ ] **Phase 2**: Canonical Product Catalog, Variants, Channel Listing models, Mapping Engine (exact SKU, barcode, title suggestions), and Mapping Conflict resolution.
- [ ] **Phase 3**: BullMQ workers, Redis queue setup with fallback runner, async sync framework, idempotency controls, and reconciliation scheduler.
- [ ] **Phase 4**: Shopify Connector (OAuth, product import, inventory push, price sync, webhooks, HMAC verification).
- [ ] **Phase 5**: eBay Connector (OAuth token refresh, inventory items, offers, publication, order sync).
- [ ] **Phase 6**: Custom Website Connector (SSRF-protected REST gateway, configurable auth, polling & webhooks).
- [ ] **Phase 7**: Shared Inventory System, allocations, movement ledger, atomic stock deduction, and oversell protection.
- [ ] **Phase 8**: CSV Import & Export Center (templates, parsing, chunked BullMQ processing, formula injection defense) and Unified Order Management.
- [ ] **Phase 9**: Cost history, Financial transactions, and Granular Profit & Loss Analytics dashboard (Recharts).
- [ ] **Phase 10**: Notifications, Audit logging, Teams & RBAC permissions, and Platform Settings.
- [ ] **Phase 11**: Security audit, end-to-end testing, integration tests, and production deployment documentation.
