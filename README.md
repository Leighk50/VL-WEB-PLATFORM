# Village Limits Website — Stage 2

Stage 2 adds a secure website administration area and live content management.

## Included

- Existing Stage 1 public website
- Admin dashboard at `/admin`
- Editable menus, dishes, prices and allergens
- Editable What's On events and ticket links
- Editable opening hours, telephone, email and address
- Immediate public-site updates
- Persistent JSON data stored under Azure App Service's `/home/site/data`

## Required Azure environment variables

In Azure Portal open **VLWEB2026 → Settings → Environment variables** and add:

- `ADMIN_USERNAME` — your chosen admin username
- `ADMIN_PASSWORD` — a strong unique password
- `SESSION_SECRET` — a long random value of at least 32 characters

Save and restart the App Service.

The temporary defaults are `admin` / `ChangeMe-Immediately`, but do not leave these in use.

## Deployment

Upload the contents of this folder into the root of the GitHub repository. Keep the existing `.github` workflow folder. Commit to `main`; GitHub Actions will deploy it automatically.

## Important note

This Stage 2 draft uses Azure App Service persistent storage and is suitable for a single App Service instance. Before scaling to multiple instances, migrate content to Azure SQL or Azure Blob/Table Storage.


## Stage 2.1 login fix
Uses both a secure cookie and a signed session token fallback for Azure browsers/proxies.
