BEGIN;
ALTER TABLE epos_site_local_services ADD COLUMN IF NOT EXISTS print_service_token_hash text;
ALTER TABLE epos_site_local_services ADD COLUMN IF NOT EXISTS print_service_token_issued_at timestamptz;
COMMIT;
