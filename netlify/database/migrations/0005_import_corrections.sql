-- Preserve Free Navy officer corrections when external source data refreshes.
-- This migration is additive and safe for existing production data.

alter table public.game_catalog add column if not exists officer_locked boolean not null default false;
alter table public.catalog_locations add column if not exists officer_overrides jsonb not null default '{}'::jsonb;
alter table public.catalog_locations add column if not exists officer_locked boolean not null default false;

create index if not exists idx_game_catalog_officer_locked on public.game_catalog(officer_locked) where officer_locked = true;
create index if not exists idx_catalog_locations_officer_locked on public.catalog_locations(officer_locked) where officer_locked = true;
