BEGIN;
ALTER TABLE epos_catalogue_products ADD COLUMN IF NOT EXISTS legacy_source_id text;
ALTER TABLE epos_catalogue_products ADD COLUMN IF NOT EXISTS measures jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS epos_catalogue_products_legacy_source_unique
 ON epos_catalogue_products(venue_id,legacy_source_id) WHERE legacy_source_id IS NOT NULL;
ALTER TABLE epos_option_choices ADD COLUMN IF NOT EXISTS linked_product_id uuid REFERENCES epos_catalogue_products(id) ON DELETE SET NULL;
COMMIT;
