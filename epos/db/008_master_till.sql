-- Site master till configuration; one master per venue, no additional device licence.
BEGIN;
CREATE TABLE IF NOT EXISTS epos_site_local_services(
 venue_id uuid PRIMARY KEY REFERENCES epos_venues(id),
 master_device_id uuid REFERENCES epos_devices(id),
 receipt_printer_host inet,
 receipt_printer_port integer NOT NULL DEFAULT 9100 CHECK(receipt_printer_port BETWEEN 1 AND 65535),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON epos_site_local_services TO vl_epos_app;
INSERT INTO epos_site_local_services(venue_id,receipt_printer_host,receipt_printer_port)
SELECT id,'192.168.0.175',9100 FROM epos_venues WHERE code='VL'
ON CONFLICT(venue_id) DO NOTHING;
COMMIT;
