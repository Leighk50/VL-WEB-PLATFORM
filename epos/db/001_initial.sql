-- Village Limits EPOS: initial shared ledger schema (PostgreSQL 16+)
-- No existing reservation or website tables are modified.
BEGIN;
CREATE TABLE IF NOT EXISTS epos_tables (
 id smallint PRIMARY KEY CHECK(id BETWEEN 1 AND 11),
 capacity smallint NOT NULL CHECK(capacity>0),
 dog_friendly boolean NOT NULL DEFAULT false
);
INSERT INTO epos_tables(id,capacity,dog_friendly) VALUES
 (1,2,true),(2,6,true),(3,3,false),(4,2,false),(5,2,false),
 (6,4,false),(7,8,false),(8,6,false),(9,6,false),(10,2,false),(11,2,false)
ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS epos_sessions (
 id uuid PRIMARY KEY,
 reservation_id text,
 table_id smallint REFERENCES epos_tables(id),
 status text NOT NULL CHECK(status IN ('open','closed')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 CHECK(table_id IS NOT NULL OR reservation_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS epos_one_open_session_per_table ON epos_sessions(table_id) WHERE status='open';
CREATE UNIQUE INDEX IF NOT EXISTS epos_one_open_session_per_reservation ON epos_sessions(reservation_id) WHERE status='open' AND reservation_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS epos_tabs (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES epos_sessions(id),
 label text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','closed')),
 UNIQUE(session_id,label),
 UNIQUE(id,session_id)
);
CREATE TABLE IF NOT EXISTS epos_orders (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES epos_sessions(id),
 tab_id uuid NOT NULL,
 origin_table_id smallint REFERENCES epos_tables(id),
 status text NOT NULL CHECK(status IN ('new','preparing','ready','collected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tab_id,session_id) REFERENCES epos_tabs(id,session_id)
);
CREATE TABLE IF NOT EXISTS epos_order_lines (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES epos_orders(id),
 product_id text NOT NULL,
 product_name text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 unit_price_pence integer NOT NULL CHECK(unit_price_pence>=0),
 modifiers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(modifiers)='array'),
 instructions text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS epos_payments (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES epos_sessions(id),
 tab_id uuid NOT NULL,
 amount_pence integer NOT NULL CHECK(amount_pence>0),
 method text NOT NULL CHECK(method IN ('cash','card','bank','deposit_credit')),
 external_reference text,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tab_id,session_id) REFERENCES epos_tabs(id,session_id)
);
CREATE TABLE IF NOT EXISTS epos_legacy_deposits (
 id uuid PRIMARY KEY,
 original_icr_reference text NOT NULL UNIQUE,
 reservation_id text NOT NULL,
 original_amount_pence integer NOT NULL CHECK(original_amount_pence>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS epos_deposit_allocations (
 id uuid PRIMARY KEY,
 deposit_id uuid NOT NULL REFERENCES epos_legacy_deposits(id),
 tab_id uuid REFERENCES epos_tabs(id),
 amount_pence integer NOT NULL CHECK(amount_pence>0),
 kind text NOT NULL CHECK(kind IN ('bill_credit','card_refund','bank_refund','cash_refund')),
 external_reference text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((kind='bill_credit' AND tab_id IS NOT NULL) OR (kind<>'bill_credit' AND tab_id IS NULL))
);
CREATE TABLE IF NOT EXISTS epos_table_moves (
 id uuid PRIMARY KEY,
 session_id uuid NOT NULL REFERENCES epos_sessions(id),
 from_table smallint NOT NULL REFERENCES epos_tables(id),
 to_table smallint NOT NULL REFERENCES epos_tables(id),
 staff_reference text NOT NULL,
 moved_at timestamptz NOT NULL DEFAULT now(),
 CHECK(from_table<>to_table)
);
CREATE TABLE IF NOT EXISTS epos_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_id uuid NOT NULL UNIQUE,
 actor_id text NOT NULL,
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS epos_idempotency (
 device_id text NOT NULL,
 request_id uuid NOT NULL,
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(device_id,request_id)
);
COMMIT;
