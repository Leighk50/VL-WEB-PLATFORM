-- Device credentials are per till, never the shared administrative API key.
BEGIN;
ALTER TABLE epos_devices ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE epos_devices ADD COLUMN IF NOT EXISTS token_issued_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS epos_device_token_hash_unique
  ON epos_devices(token_hash) WHERE token_hash IS NOT NULL;
COMMIT;
