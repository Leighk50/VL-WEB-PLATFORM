-- One-time staging migration: preserve the existing credentials for TILL-01 and TILL-02.
BEGIN;
INSERT INTO epos_device_licences(device_id,expires_at,deregistered_at)
SELECT d.id, LEAST(now()+interval '35 days',s.paid_through),NULL
FROM epos_devices d JOIN epos_site_licences s ON s.venue_id=d.venue_id
JOIN epos_venues v ON v.id=d.venue_id
WHERE v.code='VL' AND d.code IN ('TILL-01','TILL-02')
  AND d.enabled=true AND d.token_hash IS NOT NULL AND s.paid_through>now()
ON CONFLICT(device_id) DO NOTHING;
COMMIT;
