# EPOS shared database and offline delivery

The repository already contains `epos/db/001_initial.sql` with tables, sessions, tabs, orders, payments, legacy deposits, table moves, audit and idempotency records. `002_devices.sql` adds a venue and device registry, allowing Till 3, additional iPads and future venues without duplicating the catalogue.

**Current status:** schema committed, not applied to an Azure PostgreSQL instance. The browser demo still uses localStorage and is **not** a shared or offline-safe EPOS.

Before connecting live devices:
1. Provision an isolated Azure Database for PostgreSQL Flexible Server in staging. Store credentials in Azure App Service settings or Key Vault, never in GitHub.
2. Apply migrations with a migration ledger, staging backup and rollback plan. Backfill venue IDs and add NOT NULL constraints before enabling multi-venue writes.
3. Implement authenticated device registration and permissions. Each device has a revocable identity.
4. Build transactional API endpoints for sessions, tabs, orders, table moves, payments and legacy deposit allocations. Use UUID request IDs with idempotency, server-side tab validation and row locking. Test concurrent tills and replayed requests.
5. Replace localStorage orders with API calls; add IndexedDB offline queue and visible pending/conflict status. Do not claim offline orders were accepted until synchronised.
6. For full internet outages, use a venue LAN gateway so tills, iPads and kitchen can exchange orders locally. Queue writes durably and reconcile with Azure. Offline card acceptance requires separate terminal/provider verification.
7. Test restart, internet outage, duplicate retry, table move during preparation, payment and deposit refund safety, restore from backup and recovery.

Do not touch the production reservation database, website menus or ICR Touch tills until staging acceptance tests pass.
