# Village Limits Website — Stage 2.3

This release fixes menu loading and automatically repairs invalid persisted menu data.

## Azure settings

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

Optional: `CONTENT_DATA_DIR` to choose a persistent content folder.

## Diagnostics

Visit `/api/health` to confirm the Node application is running and `/api/content` to inspect the public menu data.
