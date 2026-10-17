-- Add centrally registered tills/iPads and multi-venue scope to the existing staging schema.
-- Apply after 001_initial.sql, to a NEW isolated staging database.
BEGIN;
CREATE TABLE IF NOT EXISTS epos_venues(
 id uuid PRIMARY KEY,
 code text NOT NULL UNIQUE,
 display_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS epos_devices(
 id uuid PRIMARY KEY,
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 code text NOT NULL,
 display_name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('till','ipad','kitchen','bar','gateway')),
 enabled boolean NOT NULL DEFAULT true,
 last_seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,code)
);
ALTER TABLE epos_sessions ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES epos_venues(id);
ALTER TABLE epos_legacy_deposits ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES epos_venues(id);
ALTER TABLE epos_idempotency ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES epos_venues(id);
CREATE INDEX IF NOT EXISTS epos_sessions_venue_idx ON epos_sessions(venue_id,status);
CREATE INDEX IF NOT EXISTS epos_legacy_deposits_venue_idx ON epos_legacy_deposits(venue_id,reservation_id);
-- Keep existing constraints until a verified migration/backfill is complete.
-- Do not switch to multi-venue writes until venue_id is populated and NOT NULL.
COMMIT;
