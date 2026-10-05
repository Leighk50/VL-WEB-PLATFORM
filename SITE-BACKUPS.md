# Nightly site backups

Prepared in the reservations staging branch. Disabled until Azure configuration is complete. Production is not protected by this code until it is separately deployed and configured there.

The app attempts one verified backup daily at 03:00 Europe/London (GMT/BST), checks every 15 minutes, retries on failure and catches up after downtime. Turn on App Service Always On; an app that is stopped cannot run a backup. Keep one app instance. A persistent lock avoids concurrent uploads and expires after one hour.

Each private tar.gz archive includes the entire persistent CONTENT_DATA_DIR (bookings, menus, events, enquiries, users, stock records, uploaded images), deployed top-level JS/JSON source, public assets and bundled seed data. Runtime environment variables, external services, node_modules, deployment configuration and certificates are not included. Manage Azure configuration separately with restricted access. No card numbers are collected by this system. The archive contains guest information and user password hashes and must remain private.

The data snapshot is rejected if files change during copying. SHA-256 manifest checks, local extraction and downloaded blob verification must pass before last-success.json is updated. Failure logs are prefixed `Site backup FAILED`; configure an Azure Monitor alert for those logs and a missing daily success. Local files are temporary; backups live independently in Blob Storage.

## Azure setup

1. Create a separate Standard StorageV2 storage account with public blob access disabled. Create private container `site-backups`.
2. Enable the web app's system-assigned identity (Identity > System assigned > On).
3. Assign Storage Blob Data Contributor to that identity scoped to the backup container. Upload and verification require write/read access. No storage secret key is used.
4. Add these app settings:
   - SITE_BACKUP_ENABLED=true
   - SITE_BACKUP_CONTAINER_URL=https://YOUR_ACCOUNT.blob.core.windows.net/site-backups
   - SITE_BACKUP_PREFIX=vlweb2026-staging (use vlweb2026 for production)
5. Enable Always On, apply settings and restart. An immediate catch-up backup runs if it is past 03:00 UK time.
6. Storage account > Lifecycle management: add a rule matching prefix `site-backups/` and block blobs, deleting current versions after 30 days since last modification. The supplied backup-retention-policy.json expresses this rule; merge into existing policies rather than overwriting unrelated rules. Lifecycle cleanup is asynchronous. Optional soft delete adds recovery time/storage beyond the 30-day window.
7. Confirm a dated blob appears and `Site backup verified` is logged. Check `/home/site/backup-status/last-success.json` (location follows CONTENT_DATA_DIR's parent). Configure daily failure/missing-success monitoring before relying on backups.

## Restore check and recovery

Download a trusted backup from the private container. Run `node site-backup.js verify /absolute/path/backup.tar.gz`. This extracts into a temporary directory and verifies every manifest checksum without touching live data. Local fixture tests cover bookings, content, user records and uploaded images; an actual Azure backup restore still needs testing after setup.

For actual recovery: stop the destination app; extract a trusted archive into an isolated directory, verify, retain a copy of the destination data, copy the extracted `data/` contents into its CONTENT_DATA_DIR, deploy the appropriate source version, restore Azure settings from their secured configuration record, then restart and check diary and menus. Never restore staging data over production without an explicit recovery decision. A deployment normally does not touch CONTENT_DATA_DIR.

References:
- https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity
- https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob
- https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-policy-configure
