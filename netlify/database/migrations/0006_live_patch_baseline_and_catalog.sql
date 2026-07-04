
-- Free Navy LIVE data patch.
-- This project is still in setup/testing, so this migration establishes a clean
-- 4.8.2 baseline model rather than attempting to preserve experimental imports.

CREATE TABLE IF NOT EXISTS fn_live_patch_state (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  baseline_patch text NOT NULL DEFAULT '4.8.2',
  baseline_source_version text NOT NULL DEFAULT '4.8.2-LIVE.12030094',
  official_live_patch text,
  official_build text,
  official_source_url text,
  official_detected_from text,
  last_official_check_at timestamptz,
  last_official_change_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fn_live_patch_state (singleton_id, baseline_patch, baseline_source_version)
VALUES (1, '4.8.2', '4.8.2-LIVE.12030094')
ON CONFLICT (singleton_id) DO UPDATE
SET baseline_patch = EXCLUDED.baseline_patch,
    baseline_source_version = EXCLUDED.baseline_source_version,
    updated_at = now();

CREATE TABLE IF NOT EXISTS fn_live_source_status (
  source_key text PRIMARY KEY,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  source_patch text,
  source_version text,
  source_build text,
  status text NOT NULL DEFAULT 'never_run',
  ships_received integer NOT NULL DEFAULT 0,
  vehicles_received integer NOT NULL DEFAULT 0,
  blueprints_received integer NOT NULL DEFAULT 0,
  records_published integer NOT NULL DEFAULT 0,
  records_rejected integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO fn_live_source_status (source_key, display_name)
VALUES
  ('star-citizen-wiki', 'Star Citizen Wiki API'),
  ('uex', 'UEX API')
ON CONFLICT (source_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS fn_live_game_catalog (
  id bigserial PRIMARY KEY,
  source_key text NOT NULL REFERENCES fn_live_source_status(source_key) ON DELETE RESTRICT,
  source_record_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('ship', 'vehicle', 'blueprint')),
  name text NOT NULL,
  manufacturer text,
  class_name text,
  item_type text,
  material_name text,
  patch_version text NOT NULL,
  source_version text,
  source_build text,
  environment text NOT NULL DEFAULT 'LIVE',
  verification_state text NOT NULL DEFAULT 'source_verified'
    CHECK (verification_state IN ('baseline', 'source_verified', 'needs_verification', 'officer_verified', 'rejected')),
  is_current boolean NOT NULL DEFAULT true,
  officer_locked boolean NOT NULL DEFAULT false,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, category, source_record_id, patch_version)
);

CREATE INDEX IF NOT EXISTS fn_live_game_catalog_category_current_idx
  ON fn_live_game_catalog (category, is_current, patch_version);
CREATE INDEX IF NOT EXISTS fn_live_game_catalog_name_idx
  ON fn_live_game_catalog (lower(name));
CREATE INDEX IF NOT EXISTS fn_live_game_catalog_verification_idx
  ON fn_live_game_catalog (verification_state, patch_version);

CREATE TABLE IF NOT EXISTS fn_live_blueprint_materials (
  id bigserial PRIMARY KEY,
  catalog_id bigint NOT NULL REFERENCES fn_live_game_catalog(id) ON DELETE CASCADE,
  material_key text NOT NULL,
  material_name text NOT NULL,
  quantity numeric,
  unit text,
  slot_name text NOT NULL DEFAULT '',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, material_key, slot_name)
);

CREATE INDEX IF NOT EXISTS fn_live_blueprint_materials_catalog_idx
  ON fn_live_blueprint_materials (catalog_id);
CREATE INDEX IF NOT EXISTS fn_live_blueprint_materials_name_idx
  ON fn_live_blueprint_materials (lower(material_name));


-- Publish imported blueprints into the existing member-facing crafting tables.
ALTER TABLE public.blueprints ADD COLUMN IF NOT EXISTS source_key text NOT NULL DEFAULT '';
ALTER TABLE public.blueprints ADD COLUMN IF NOT EXISTS source_record_id text NOT NULL DEFAULT '';
ALTER TABLE public.blueprints ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.blueprints ADD COLUMN IF NOT EXISTS officer_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.blueprints ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprints_source_record_patch
  ON public.blueprints(source_key, source_record_id, game_version)
  WHERE source_record_id <> '';

CREATE INDEX IF NOT EXISTS idx_blueprints_source_patch
  ON public.blueprints(source_key, game_version);

-- The portal library already has source-aware rows. Add a human-readable
-- correction reason used by the Admin editor if the column is not present yet.
ALTER TABLE public.game_catalog ADD COLUMN IF NOT EXISTS change_reason text NOT NULL DEFAULT '';

-- This repository is still in setup/testing. Seed the operational gate from the
-- verified 4.8.2 baseline; the scheduled official RSI check may advance it later.
INSERT INTO public.live_patch_records(id, environment, version, source_name, status, checked_at)
VALUES ('current-live', 'LIVE', '4.8.2', 'Free Navy 4.8.2 baseline', 'active', now())
ON CONFLICT (id) DO UPDATE SET
  environment = 'LIVE',
  version = '4.8.2',
  source_name = 'Free Navy 4.8.2 baseline',
  status = 'active',
  checked_at = now(),
  updated_at = now();

UPDATE public.sync_sources
SET required_patch = '4.8.2', updated_at = now()
WHERE source_name IN (
  'Official RSI LIVE version',
  'UEX commodities and routes',
  'Free Navy member verification',
  'Star Citizen Wiki game data',
  'UEX item and location data'
);

CREATE TABLE IF NOT EXISTS fn_live_patch_campaigns (
  id bigserial PRIMARY KEY,
  from_patch text NOT NULL,
  target_patch text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'paused', 'complete', 'cancelled')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text,
  UNIQUE (from_patch, target_patch)
);

CREATE TABLE IF NOT EXISTS fn_live_verification_tasks (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES fn_live_patch_campaigns(id) ON DELETE CASCADE,
  catalog_id bigint REFERENCES fn_live_game_catalog(id) ON DELETE SET NULL,
  category text NOT NULL,
  record_name text NOT NULL,
  material_name text NOT NULL DEFAULT '',
  source_key text NOT NULL DEFAULT '',
  source_record_id text NOT NULL DEFAULT '',
  from_patch text NOT NULL,
  target_patch text NOT NULL,
  status text NOT NULL DEFAULT 'unclaimed'
    CHECK (status IN ('unclaimed', 'claimed', 'verified', 'changed', 'not_found', 'rejected')),
  claimed_by text,
  claimed_at timestamptz,
  completed_by text,
  completed_at timestamptz,
  evidence_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, category, source_key, source_record_id, material_name)
);

CREATE INDEX IF NOT EXISTS fn_live_verification_tasks_campaign_idx
  ON fn_live_verification_tasks (campaign_id, status);

-- Compatibility repair for the pre-existing campaign implementation.
-- The missing material_name field caused Create 4.8.3 Campaign to fail.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT t.table_schema, t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (
        t.table_name ILIKE '%blueprint%'
        OR t.table_name ILIKE '%material%'
        OR t.table_name ILIKE '%craft%'
        OR t.table_name ILIKE '%verification%'
        OR t.table_name ILIKE '%campaign%'
        OR t.table_name ILIKE '%game_data%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
          AND c.column_name = 'material_name'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN material_name text', target.table_schema, target.table_name);
  END LOOP;
END $$;

CREATE OR REPLACE VIEW fn_live_ship_library AS
SELECT *
FROM fn_live_game_catalog
WHERE category IN ('ship', 'vehicle')
  AND is_current = true
  AND environment = 'LIVE';

CREATE OR REPLACE VIEW fn_live_blueprint_library AS
SELECT
  c.*,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'material_key', m.material_key,
        'material_name', m.material_name,
        'quantity', m.quantity,
        'unit', m.unit,
        'slot_name', m.slot_name
      ) ORDER BY m.id
    ) FILTER (WHERE m.id IS NOT NULL),
    '[]'::jsonb
  ) AS materials
FROM fn_live_game_catalog c
LEFT JOIN fn_live_blueprint_materials m ON m.catalog_id = c.id
WHERE c.category = 'blueprint'
  AND c.is_current = true
  AND c.environment = 'LIVE'
GROUP BY c.id;
