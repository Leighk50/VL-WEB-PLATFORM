-- Staging safety gate before first Azure-to-local print worker connection.
-- Old uncollected test jobs must not suddenly print when the worker is enabled.
BEGIN;
UPDATE epos_print_jobs
SET status='review',completed_at=now(),
    error_message='Held for review before initial master print service activation'
WHERE status='queued' AND job_type='test';
COMMIT;
