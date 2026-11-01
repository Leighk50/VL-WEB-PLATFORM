BEGIN;
CREATE TABLE IF NOT EXISTS epos_screen_layouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 venue_id uuid NOT NULL REFERENCES epos_venues(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 device_class text NOT NULL DEFAULT 'desktop' CHECK(device_class IN ('desktop','tablet','phone')),
 layout jsonb NOT NULL DEFAULT '{"columns":5,"buttons":[]}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(venue_id,name,device_class)
);
GRANT SELECT,INSERT,UPDATE ON epos_screen_layouts TO vl_epos_app;
COMMIT;
