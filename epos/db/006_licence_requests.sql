BEGIN;
CREATE TABLE IF NOT EXISTS epos_licence_requests(
 id uuid PRIMARY KEY,
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 device_code text NOT NULL,
 device_type text NOT NULL CHECK(device_type='till'),
 claim_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','claimed')),
 expires_at timestamptz NOT NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS epos_licence_requests_lookup ON epos_licence_requests(venue_id,status,expires_at);
GRANT SELECT,INSERT,UPDATE ON epos_licence_requests TO vl_epos_app;
COMMIT;
