BEGIN;
CREATE TABLE IF NOT EXISTS epos_catalogue_products(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 category text NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 60),
 price_pence integer NOT NULL CHECK(price_pence BETWEEN 0 AND 10000000),
 printer_role text NOT NULL DEFAULT 'kitchen' CHECK(printer_role IN ('kitchen','bar','receipt')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS epos_option_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 selection_mode text NOT NULL CHECK(selection_mode IN ('single','multiple')),
 required boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS epos_option_choices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES epos_option_groups(id) ON DELETE CASCADE,
 label text NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 100),
 price_delta_pence integer NOT NULL DEFAULT 0 CHECK(price_delta_pence BETWEEN 0 AND 1000000),
 sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS epos_product_option_groups(
 product_id uuid NOT NULL REFERENCES epos_catalogue_products(id) ON DELETE CASCADE,
 group_id uuid NOT NULL REFERENCES epos_option_groups(id) ON DELETE CASCADE,
 PRIMARY KEY(product_id,group_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON epos_catalogue_products,epos_option_groups,epos_option_choices,epos_product_option_groups TO vl_epos_app;
COMMIT;
