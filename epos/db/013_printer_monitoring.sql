BEGIN;
CREATE TABLE IF NOT EXISTS epos_printer_status (
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 printer_role text NOT NULL CHECK (printer_role IN ('receipt','kitchen')),
 state text NOT NULL CHECK (state IN ('online','offline','unknown')),
 checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (venue_id,printer_role)
);
GRANT SELECT,INSERT,UPDATE ON epos_printer_status TO vl_epos_app;
COMMIT;
