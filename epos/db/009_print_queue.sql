-- Staging-only print queue. A claimed job is never automatically reissued.
BEGIN;
CREATE TABLE IF NOT EXISTS epos_print_jobs (
 id uuid PRIMARY KEY,
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 source_device_id uuid NOT NULL REFERENCES epos_devices(id),
 printer_role text NOT NULL CHECK(printer_role='receipt'),
 job_type text NOT NULL CHECK(job_type='test'),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','claimed','printed','review')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz,
 completed_at timestamptz,
 claimed_by uuid REFERENCES epos_devices(id),
 error_message text,
 UNIQUE(source_device_id,id)
);
CREATE INDEX IF NOT EXISTS epos_print_jobs_queue ON epos_print_jobs(venue_id,status,created_at);
GRANT SELECT,INSERT,UPDATE ON epos_print_jobs TO vl_epos_app;
COMMIT;
