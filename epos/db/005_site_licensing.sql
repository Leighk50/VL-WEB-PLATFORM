-- Lindus EPOS staging licence foundation. Does not grant paid entitlements automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS epos_site_licences(
 venue_id uuid PRIMARY KEY REFERENCES epos_venues(id),
 max_tills integer NOT NULL DEFAULT 0 CHECK(max_tills>=0),
 paid_through timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS epos_device_licences(
 device_id uuid PRIMARY KEY REFERENCES epos_devices(id),
 expires_at timestamptz NOT NULL,
 deregistered_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS epos_device_licences_expiry ON epos_device_licences(expires_at);
GRANT SELECT,INSERT,UPDATE ON epos_site_licences,epos_device_licences TO vl_epos_app;
INSERT INTO epos_site_licences(venue_id,max_tills,paid_through)
SELECT id,0,NULL FROM epos_venues WHERE code='VL' ON CONFLICT DO NOTHING;
COMMIT;
