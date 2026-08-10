# Village Limits Compliance Hub

Production-oriented foundation for a separate, mobile-first compliance application. It does not share authentication, routes, content files, or operational records with the public Village Limits website.

## Architecture

- React + TypeScript responsive client, served separately from the API in development.
- Express API with Helmet, strict JSON limits, JWT sessions, bcrypt password hashes, role gates and venue scoping.
- Authentication tokens contain only a user identity; active state, current role and current venue are reloaded from the database on every request. Login and general API rate limits provide baseline brute-force protection.
- Relational schema covering venues/locations, assets, append-only PAT tests, extinguishers/checks, alarm tests/services, risk assessments, furnishings, documents/version links, photos, corrective actions and immutable audit events.
- `ObjectStorage` abstraction with a private local adapter. Azure Blob is the production target; uploaded objects are never public by default.
- Local database adapter uses Node's built-in SQLite driver and WAL journalling. Operational records are not stored in website JSON.
- Azure SQL is the production target. The schema deliberately uses conventional relational types and foreign keys so an Azure SQL adapter/migrations can replace the local adapter without changing API contracts.

## Local development

Requires Node 24+.

```sh
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`. With `DEMO_SEED=true`, sign in using `admin@demo.local` / `ChangeMe!123`. These records and the venue are labelled demo data. Change or disable this credential before any shared deployment.

Checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Environment variables

See `.env.example`. `JWT_SECRET` must be a randomly generated value of at least 32 bytes in production. Secrets belong in Azure Key Vault/App Service settings, never source control. Set an exact `CORS_ORIGIN` for the compliance hostname.

## Azure SQL requirements

Provision a private Azure SQL database, Entra/managed-identity access for the application, encrypted connections, point-in-time restore, geo/backups appropriate to business needs, and auditing/Defender policies. Add a production `Database` adapter and idempotent migration runner using `AZURE_SQL_CONNECTION_STRING` or preferably managed identity. Translate SQLite `INTEGER PRIMARY KEY` to SQL Server `BIGINT IDENTITY`; preserve all constraints, history tables and indexes. Run migrations as a separate least-privileged deployment step.

## Azure Blob Storage requirements

Provision a private container (suggested `compliance-private`), disable anonymous access, use managed identity with Blob Data Contributor scoped to that container, enable encryption, soft delete, versioning, lifecycle policies and malware/content scanning. Implement the existing `ObjectStorage` interface with the Azure SDK. Serve downloads only after API authorization using short-lived SAS URLs or streamed authenticated responses. Configure size/type allowlists and retention.

## Production security

- Replace demo credentials, turn `DEMO_SEED` off, enforce a strong secret and HTTPS-only secure cookies or an Entra-backed session implementation.
- Add MFA/SSO, password reset and account lifecycle workflows before real users are onboarded.
- Put the API behind App Service authentication/WAF/rate limiting; add CSRF controls if moving JWTs to cookies.
- Validate all file contents, scan uploads, log access, centralise audit events in Application Insights/Log Analytics, and configure alerting.
- Apply venue scope and least privilege to every new endpoint. Auditor remains read-only; destructive history deletion endpoints intentionally do not exist.
- Complete a DPIA/retention policy, penetration test, dependency/SAST scanning and recovery drill before launch.

## Deployment plan (not performed)

1. Create separate Azure SQL, Storage, Key Vault, App Service/Static Web App resources and managed identities in a non-production environment.
2. Implement/test the Azure adapters, migrations and private networking.
3. Build in CI, run lint/type/tests, scan dependencies and deploy to staging only.
4. Configure `compliance.villagelimits.co.uk`, managed TLS, exact CORS/CSP and monitoring.
5. Carry out UAT on phones/tablets, accessibility/security testing and restore testing.
6. Obtain owner approval before a production release. This iteration does not deploy or alter the existing website.

## Current iteration boundaries

The working foundation includes strict per-resource validation, authentication/RBAC, enforced venue/location boundaries, dashboard, core register CRUD, append-only PAT and extinguisher checks, camera barcode scanning with fallback, authenticated historical photographs, document-link validation, reports index and responsive UI. Azure adapters, account administration/MFA, CSV/PDF generators and automated action creation require follow-on implementation and Azure resources.
