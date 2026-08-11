# Village Limits Compliance Hub

Separate, mobile-first compliance application. It does not share authentication, routes, content files, deployment packaging, or operational records with the public Village Limits website.

## Architecture

- React, TypeScript and Vite frontend; Express API and compiled frontend run in one Node 22 Linux process in production.
- Async database interface selects SQLite locally/tests or Azure SQL in staging/production.
- Azure SQL uses `mssql`/Tedious with an access token from `DefaultAzureCredential`; no SQL password path exists.
- Deterministic, versioned, rerunnable migrations translate the relational model to SQLite or SQL Server (`BIGINT IDENTITY`, `DATETIME2`, `NVARCHAR`, SQL Server indexes/defaults).
- Private object-storage interface selects the local filesystem only outside production or Azure Blob Storage using `DefaultAzureCredential`.
- Blob downloads are streamed through authenticated, venue-authorized `/files` routes. Containers/blobs are never made public.
- JWTs contain identity only. Active state, role and venue are reloaded from the database on every request.
- Append-only PAT, extinguisher check, photograph and audit history behavior is unchanged across providers.

## Local development

Requires Node 22 or 24.

```sh
npm install
copy .env.example .env
npm run migrate:dev
npm run dev
```

With `DEMO_SEED=true`, local SQLite is seeded with the clearly labelled demo account `admin@demo.local` / `ChangeMe!123`. Production always disables demo seeding regardless of the supplied value.

Checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit`.

## Deterministic migrations

`npm run build` compiles the migration runner, then:

```sh
npm run migrate
```

The command obtains managed-identity credentials in Azure, creates `schema_migrations` if required, and applies only unapplied versions. It is safe to rerun. Application startup runs the same deterministic migration runner before Express begins accepting traffic, allowing a completely empty staging database to bootstrap under the App Service managed identity. Azure SQL migrations run inside a serializable transaction guarded by `sp_getapplock`, so repeated or concurrent starts cannot apply the same migration twice. A migration failure is logged with its underlying error and terminates startup.

Migration 2 adds append-only document attachments, fire-alarm call-point master data, structured weekly-test fields, venue rotation settings and configurable document types. It preserves all existing document and weekly-test rows. The normal `npm start` sequence applies it before the application accepts traffic.

## Evidence and fire-alarm records

- Certificate evidence accepts up to 10 PDF, JPEG, PNG, HEIC or HEIF files per request, with a 15 MB limit per file. Attachments are retained independently of later certificate renewals.
- Production evidence remains in the private Azure Blob container. The browser receives only authenticated application endpoints, never Blob URLs, SAS tokens or storage credentials.
- Fire-alarm call points are venue/location scoped master data. Weekly tests reference an active call point and are append-only.
- The call-point rotation warning is venue-specific master data maintained by administrators; no legal interval is hard-coded into the application.

The App Service system-assigned managed identity requires **Storage Blob Data Contributor** scoped to the `compliance-private` container (preferred) or the `vlcompliancestaging` storage account. This data-plane role permits evidence upload, read/download and diagnostic cleanup; the management-plane Contributor role alone is insufficient.

To verify managed-identity Blob access from App Service SSH without SQL credentials, storage keys or SAS tokens:

```sh
cd /home/site/wwwroot
npm run storage:diagnostic
```

The command uploads a uniquely named small PDF, downloads the exact same key, verifies bytes and content type, then deletes the diagnostic Blob. It does not create database metadata.

## Azure staging architecture

Already provisioned:

- App Service `vl-compliance-staging`, UK West, Node 22 Linux, system-assigned managed identity.
- Azure SQL server `vl-compliance-staging-sql.database.windows.net`, database `vl-compliance-staging-db`.
- Database user `vl-compliance-staging` with data reader/writer and migration DDL permissions.
- Storage account `vlcompliancestaging`, private container `compliance-private`.
- App Service identity has Storage Blob Data Contributor on the storage scope.

The runtime uses the App Service system identity for both Azure SQL access tokens and Blob authorization. No SQL login, password, storage key, connection string, publish profile, or SAS secret is supported.

## Required App Service settings

Configure these under **App Service → Configuration → Application settings**:

```text
NODE_ENV=production
DATABASE_PROVIDER=azure-sql
AZURE_SQL_SERVER=vl-compliance-staging-sql.database.windows.net
AZURE_SQL_DATABASE=vl-compliance-staging-db
STORAGE_PROVIDER=azure-blob
AZURE_STORAGE_ACCOUNT=vlcompliancestaging
AZURE_STORAGE_CONTAINER=compliance-private
JWT_SECRET=<random secret of at least 32 characters, stored only in App Settings/Key Vault>
DEMO_SEED=false
CORS_ORIGIN=https://vl-compliance-staging.azurewebsites.net
LOGIN_RATE_LIMIT=10
API_RATE_LIMIT=600
SCM_DO_BUILD_DURING_DEPLOYMENT=false
```

Do not set `PORT`; Azure supplies it. Set the App Service startup command to `npm start`. Production startup fails if the JWT secret is missing/weak or local providers are selected.

Under **Health check**, configure path `/health`. The endpoint reports service/provider readiness without credentials or internal error details.

## SQL networking requirement

Managed identity handles authentication, not firewall routing. Before migration/runtime:

- Preferred: integrate the App Service with a VNet, use an Azure SQL private endpoint and private DNS for `privatelink.database.windows.net`.
- Staging alternative: enable Azure SQL public networking and add every App Service outbound IP to the SQL firewall (or temporarily allow Azure services only if that broader posture is explicitly accepted).

Verify from the App Service/Kudu environment that port 1433 and DNS resolution reach the SQL server. The normal `npm start` command now migrates before starting the server, so SSH bootstrap is not required. `npm run migrate` remains available as an explicit, safe-to-rerun administrative command.

## Create the first administrator

After the first successful deployment, open an SSH session for the Compliance Hub App Service and run exactly:

```sh
cd /home/site/wwwroot
npm run create-admin
```

Enter the administrator email, display name, password and password confirmation at the prompts. Password input is hidden. The command uses the same database adapter as the application, so in Azure it authenticates to SQL with the App Service system-assigned managed identity and requires no SQL credentials. It creates only the non-demo `Village Limits` venue, its default operational locations and the real administrator; it never enables demo seeding or creates demo compliance records. A duplicate email is refused, and creating an additional administrator requires explicit terminal confirmation.

## GitHub Actions staging workflow

`.github/workflows/compliance-staging.yml` validates only the `compliance/` application on pushes to `codex/compliance-hub`. It uses Node 22, `npm ci`, tests, lint, typecheck and a production build. A push **cannot deploy**: the deploy job runs only from `workflow_dispatch` and is additionally bound to the protected `compliance-staging` GitHub Environment.

The deployment artifact contains only the compiled Compliance Hub, its package manifests and production dependencies. The root Village Limits website and its existing workflow are untouched.

### OIDC configuration still required

1. Create an Entra application or, preferably, a user-assigned managed identity for GitHub staging deployment (for example `vl-compliance-github-staging`). This is separate from the App Service runtime identity.
2. Assign it the minimum `Website Contributor` role scoped to App Service `vl-compliance-staging` (not the subscription). It does not need SQL or Blob data roles because migrations/runtime use the App Service identity.
3. Add a federated credential with:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Audience: `api://AzureADTokenExchange`
   - Subject: `repo:Leighk50/VL-WEB-PLATFORM:environment:compliance-staging`
4. In GitHub, create Environment `compliance-staging`, add required reviewers, prevent self-review if desired, and restrict deployment branches to `codex/compliance-hub` while staging is under review.
5. Add Environment secrets:
   - `AZURE_CLIENT_ID`: deployment application/user-assigned identity client ID.
   - `AZURE_TENANT_ID`: Entra tenant ID.
   - `AZURE_SUBSCRIPTION_ID`: Azure subscription ID.
6. Review this PR/workflow. Only afterward, manually run **Compliance Hub staging** with `workflow_dispatch` and approve the protected environment gate.

No publish profile or client secret should be created.

## Staging test checklist

1. Confirm App Settings, startup command, Node 22 stack and `/health` health check.
2. Confirm SQL DNS/firewall/private connectivity from App Service.
3. Confirm startup logs show the initial migration completing before the server begins listening; no SSH bootstrap command is required.
4. Verify `/health` returns HTTP 200 and identifies `azure-sql`/`azure-blob` without sensitive data.
5. Create non-demo administrator and venue-scoped test users through an approved bootstrap/admin process before disabling any temporary setup access.
6. Test role/venue isolation, login throttling, asset barcode scanning, PAT history, extinguisher checks, photo upload/main-photo history and authenticated downloads on phones.
7. Confirm blobs remain private and cannot be downloaded anonymously.
8. Confirm failed requests and Azure SDK/SQL failures return generic client errors; inspect Application Insights for server-side diagnostics.
9. Verify audit events and database backups/restore posture.
10. Do not promote to production until accessibility, security, retention/DPIA, penetration and recovery testing are complete.

## Production security notes

- Keep JWT secrets in App Settings backed by Key Vault references and rotate them deliberately.
- Add MFA/SSO, password reset and account lifecycle workflows before real users are onboarded.
- Add Application Insights/Log Analytics, alerting, file malware scanning, retention policies, WAF/rate limiting and dependency/SAST scanning.
- Apply venue scope and least privilege to every new endpoint. Auditor remains read-only; destructive history deletion endpoints intentionally do not exist.
