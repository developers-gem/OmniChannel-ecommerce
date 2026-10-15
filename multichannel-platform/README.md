# Centralized Multichannel Ecommerce Management Platform

A high-performance, enterprise-grade multichannel ecommerce platform designed to connect **Shopify**, **eBay**, and **Custom REST Stores**, providing centralized product catalog management, cross-channel listing mapping, automated inventory synchronization, CSV import/export, unified order fulfillment, and granular Profit & Loss analytics.

## Monorepo Architecture

```
multichannel-platform/
  apps/
    web/                  # Next.js 14 App Router, Tailwind CSS, TanStack Query, Zustand, Recharts
  services/
    api/                  # Express.js, TypeScript, Mongoose, JWT Auth, REST APIs, Webhooks
    worker/               # BullMQ async worker for catalog sync, inventory sync, CSV processing
  packages/
    shared/               # Shared TypeScript schemas, types, DTOs, and domain interfaces
  infrastructure/
    docker/               # Container configurations and deployment manifests
  docs/                   # Comprehensive technical documentation
  tests/                  # End-to-end and cross-service integration test suites
```

## Approved Technology Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query, Zustand, Recharts, React Hook Form, Zod, Lucide React, Axios
- **Backend API**: Node.js, Express.js, TypeScript, MongoDB / Mongoose, JWT (Access & Refresh), Argon2/Bcrypt, Redis, BullMQ, Winston structured logging
- **Background Worker**: Node.js, BullMQ, Redis, Idempotent job handlers, exponential backoff retries
- **Database & Queue**: MongoDB 7.0 (with transactional safety), Redis 7.0

## Quick Start

### 1. Prerequisites
- Node.js >= 20.x
- MongoDB (Running locally on `27017` or via Docker)
- Redis (Running on `6379` or via in-memory local runner)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Copy `.env.example` to `services/api/.env` and `apps/web/.env.local`:
```bash
cp .env.example services/api/.env
```

### 4. Run Development Services
```bash
# Start all services concurrently
npm run dev

# Or start independently
npm run dev:api     # Backend REST API on port 5000
npm run dev:worker  # BullMQ background processor
npm run dev:web     # Next.js frontend on port 3000
```

## Documentation
- [System Architecture](file:///c:/Users/acer/Desktop/nr/multichannel-platform/docs/ARCHITECTURE.md)
- [Database Schema & Models](file:///c:/Users/acer/Desktop/nr/multichannel-platform/docs/DATABASE.md)
- [Channel Integrations Specification](file:///c:/Users/acer/Desktop/nr/multichannel-platform/docs/INTEGRATIONS.md)
- [Implementation Plan](file:///c:/Users/acer/Desktop/nr/multichannel-platform/docs/IMPLEMENTATION_PLAN.md)
- [Progress Log](file:///c:/Users/acer/Desktop/nr/multichannel-platform/docs/PROGRESS.md)

