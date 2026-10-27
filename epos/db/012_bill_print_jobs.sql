BEGIN;
ALTER TABLE epos_print_jobs DROP CONSTRAINT IF EXISTS epos_print_jobs_job_type_check;
ALTER TABLE epos_print_jobs ADD CONSTRAINT epos_print_jobs_job_type_check CHECK(job_type IN ('test','bill'));
COMMIT;
