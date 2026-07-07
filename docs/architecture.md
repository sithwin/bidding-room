# Architecture — The Carat Room

This diagram reflects the codebase as built. It differs from the original spec
([specs/2026-06-20-architecture-design.md](superpowers/specs/2026-06-20-architecture-design.md))
in one respect: the spec proposed consolidating services (`core-service`, `fulfilment-service`),
but the implementation kept them separate.

## System Overview

```mermaid
graph TB
    subgraph Clients
        Buyer([Buyer browser])
        Staff([Admin staff browser])
    end

    subgraph Frontends
        UP["User Portal<br/>Next.js"]
        AP["Admin Portal<br/>Next.js + Shadcn/ui<br/>SWR polling 5s"]
    end

    subgraph Backend["Backend services (Hono)"]
        US["User Service :3001<br/>auth, JWT, phone OTP"]
        CS["Catalogue Service :3002<br/>lots, categories, R2 images"]
        AE["Auction Engine :3003<br/>Event Sourcing + CQRS<br/>bidding, timers, SSE"]
        PS["Payment Service :3004<br/>Stripe Checkout, invoices"]
        NS["Notification Service :3005<br/>Resend email, Twilio SMS"]
        SS["Shipping Service :3006<br/>fulfilment, collection slots"]
        AS["Admin Service :3007<br/>thin BFF proxy, no DB<br/>IP-allowlisted at Nginx"]
    end

    subgraph Infrastructure
        PG[("PostgreSQL 16<br/>one DB per service")]
        RD[("Redis 7<br/>timers + BullMQ")]
        MQ[("RabbitMQ 3.13<br/>topic exchange carat.events")]
    end

    Buyer --> UP
    Staff --> AP

    UP -->|"HTTP + SSE (live bids)"| AE
    UP --> US
    UP --> CS
    UP --> PS

    AP -->|"/admin/api/* (single entry point)"| AS
    AS --> US
    AS --> CS
    AS --> AE
    AS --> PS
    AS --> SS

    US --> PG
    CS --> PG
    AE --> PG
    AE --> RD
    PS --> PG
    SS --> PG

    US -.->|publish/subscribe| MQ
    AE -.-> MQ
    PS -.-> MQ
    NS -.-> MQ
    SS -.-> MQ
```

## Key architectural decisions

| Decision | Detail |
|---|---|
| Admin Service as BFF | Admin Portal calls one service; the Admin Service validates the admin JWT and fans out to domain services over internal HTTP. It owns no database — all reads and mutations go through each service's API, preserving service boundary ownership. Kept separate so Nginx can IP-allowlist the whole `/admin/*` surface with one rule. |
| User Portal has no BFF | Public traffic is routed by Nginx path prefix directly to each domain service. Its few Next.js API routes exist to manage the httpOnly refresh-token cookie, not to aggregate services. |
| Event Sourcing | Auction Engine only. All other services are standard CRUD. |
| Service communication | State changes travel as RabbitMQ domain events on the `carat.events` topic exchange. No cross-service database access; no service-to-service HTTP for state mutations (the Admin Service proxies requests but each operation is a single downstream call). |
| Realtime | SSE from the Auction Engine to the lot detail page; bids submitted via HTTP POST. Admin Portal polls with SWR instead. |
| Auth | RS256 JWT issued by the User Service; every service validates independently with the shared public key (`shared-auth`). Admin routes require `role: ADMIN`. |

## Dashboard request flow (example)

```mermaid
sequenceDiagram
    participant AP as Admin Portal
    participant AS as Admin Service :3007
    participant AE as Auction Engine :3003

    AP->>AS: GET /admin/api/reports/dashboard (Bearer JWT)
    AS->>AS: verify JWT, role = ADMIN
    AS->>AE: GET /api/reports/dashboard (forward JWT)
    AE->>AE: verify JWT, query lot_status projection
    AE-->>AS: { activeAuctions, endingSoon, ... }
    AS-->>AP: proxied response
```
