# Village Limits reservations: staff diary preview

This branch adds a Reservations panel to the existing back office. It does not replace the live ICRTouch booking widget. Staff records entered here do not synchronise with ICRTouch; do not run two independent diaries for the same service without reconciling bookings.

## Implemented

- Tables 1–11: capacities 2, 6, 3, 2, 2, 4, 8, 6, 6, 2, 2 (43 seats).
- Tables 1 and 2 are dog-friendly. Each permits one non-cancelled dog booking per London calendar date, regardless of sitting time. Small dog parties preferentially use table 1. Non-dog parties preferentially use other tables; physical overlaps are always prevented.
- Two-hour table occupancy; no automatic table combinations or party sizes over eight.
- Wednesday–Saturday arrivals: 18:00, 18:20, 18:40, 19:00, 19:20, 19:30. Sunday: 12:00, 12:20, 12:40, 13:00, 13:20, 13:30. Monday/Tuesday closed.
- Maximum 12 covers in every rolling 40-minute half-open window. Arrivals exactly 40 minutes apart do not share a window. Extra final slots still count against earlier arrivals.
- Per-date closing or extension of service. Normal extra final slots are retained. Existing bookings cannot be invalidated by service changes.
- Staff create/edit bookings; arrived, completed, cancelled and no-show states.
- Free cancellation at least four hours before arrival. Later cancellation/no-show records a £5 per booked cover policy charge for review. **No payment is attempted.** London daylight saving is handled.
- Separate reservations permission for staff accounts, authentication and cross-site mutation protections.
- Revision checks reject stale edits. Atomic writes, process/file locking, previous-version backup and audit snapshots protect reservation records.

## Storage and operations

`reservations.json`, its `.backup` and audit history use the existing persistent CONTENT_DATA_DIR. Menu/event content is not changed by reservation actions. Ensure this directory is on durable storage and included in scheduled off-site backups. It contains guest contact details; apply the venue's retention policy to records, audit history and backups.

This follows the site's existing JSON-storage architecture. Use a single App Service instance until a transactional database is introduced. A crash during a mutation can leave `reservations.lock`; stop writers, validate the main/backup JSON and remove the stale directory before restarting. The code fails closed when storage is corrupt or locked.

## Required before replacing ICRTouch

1. Select/connect a secure card provider, including credentials and webhook configuration. Implement card setup, authentication where required, secure tokens and explicit cancellation-policy acceptance. No card numbers or security codes belong in application storage or logs.
2. Build the customer booking and secure card-link flows, guest change/cancel links, confirmations/reminders and staff-approved charging with idempotency.
3. Migrate upcoming ICR reservations, agree cutover and verify table/capacity rules with staff. Deploy/test against production hosting configuration before switching the website booking page.
4. Confirm whether non-dog bookings may use tables 1/2; the preview allows this when physical occupancy permits.

## Validation

`npm test` checks reservation rules, storage conflicts, API permissions, service overrides, London summer/winter time and cancellation boundaries, plus existing enquiry/menu persistence checks. Browser-based visual acceptance and live payment tests remain outstanding.
