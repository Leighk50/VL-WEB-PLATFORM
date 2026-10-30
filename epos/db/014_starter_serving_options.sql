BEGIN;
ALTER TABLE epos_order_lines ADD COLUMN IF NOT EXISTS serving_option text NOT NULL DEFAULT 'standard';
ALTER TABLE epos_order_lines ADD CONSTRAINT epos_order_lines_serving_option_check CHECK (serving_option IN ('starter','with_mains','main_portion','standard'));
COMMIT;
