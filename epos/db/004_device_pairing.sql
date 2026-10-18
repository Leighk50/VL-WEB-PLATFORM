-- Camera-free manager-approved pairing for tills, tablets and phones.
BEGIN;
CREATE TABLE IF NOT EXISTS epos_device_pairings (
 id uuid PRIMARY KEY,
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 device_id uuid NOT NULL REFERENCES epos_devices(id),
 code_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS epos_pairing_expiry ON epos_device_pairings(expires_at);
COMMIT;
