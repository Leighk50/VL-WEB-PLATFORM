# Village Limits Platform — Version 1.0.0

Clean baseline deployment.

## Included
- Homepage
- Menu directory and five menu pages
- Stay page with direct-booking button
- Table reservation embed
- What's On
- Private Events
- Contact
- Working admin login and deployment inventory
- Version/build display in footer and admin dashboard

## Azure environment variables
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

## Checks
- `/api/version` shows the deployed version and build.
- `/api/content` shows exactly which content is in this release.
- `/admin` shows the menu inventory after sign-in.
