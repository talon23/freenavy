-- Free Navy command ranks, concurrent appointments, private applications and imported game data.

alter table public.profiles add column if not exists rank text;
alter table public.profiles add column if not exists time_zone text default '';
alter table public.profiles add column if not exists preferred_activities text default '';
alter table public.profiles add column if not exists availability_notes text default '';

update public.profiles
set rank = case role
  when 'owner' then 'president'
  when 'officer' then 'officer'
  else 'enlisted'
end
where rank is null or rank = '';

alter table public.profiles alter column rank set default 'enlisted';
alter table public.profiles alter column rank set not null;
alter table public.profiles drop constraint if exists profiles_rank_check;
alter table public.profiles add constraint profiles_rank_check check (
  rank in (
    'president','vice_president','general','admiral','vice_admiral',
    'rear_admiral','brigadier_general','officer','enlisted'
  )
);

create table if not exists public.member_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','quartermaster','treasurer')),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique(profile_id, role)
);

insert into public.member_roles(profile_id, role)
select id, role from public.profiles
where role in ('admin','quartermaster','treasurer')
on conflict(profile_id, role) do nothing;

create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  rsi_handle text default '',
  discord_handle text default '',
  message text default '',
  token_date date not null,
  status text not null default 'pending' check (status in ('pending','approved','refused','withdrawn','expired')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text default '',
  identity_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_membership_application_pending_email
  on public.membership_applications(lower(email)) where status = 'pending';

create table if not exists public.data_flags (
  id uuid primary key default gen_random_uuid(),
  target_table text not null,
  target_id text not null,
  target_name text default '',
  reason text not null,
  explanation text not null,
  suggested_correction text default '',
  evidence_url text default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  reported_by uuid not null references public.profiles(id) on delete cascade,
  resolved_by uuid references public.profiles(id),
  resolution_notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_data_flags_target on public.data_flags(target_table, target_id, status);

create table if not exists public.game_catalog (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  source_name text not null,
  source_id text not null,
  game_uuid text,
  name text not null,
  category text default '',
  subcategory text default '',
  manufacturer text default '',
  description text default '',
  game_version text not null,
  environment text not null default 'LIVE' check (environment = 'LIVE'),
  status text not null default 'active' check (status in ('active','stale','removed','flagged')),
  confidence text not null default 'source' check (confidence in ('source','confirmed','corrected','flagged','stale')),
  source_url text default '',
  source_updated_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  officer_overrides jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_name, entity_type, source_id)
);
create index if not exists idx_game_catalog_type_name on public.game_catalog(entity_type, name);
create index if not exists idx_game_catalog_patch on public.game_catalog(game_version, environment, status);
create index if not exists idx_game_catalog_uuid on public.game_catalog(game_uuid);

create table if not exists public.catalog_locations (
  id uuid primary key default gen_random_uuid(),
  external_key text unique not null,
  catalog_id uuid references public.game_catalog(id) on delete cascade,
  entity_name text not null,
  category text default '',
  system_name text default '',
  body_name text default '',
  location_name text not null,
  terminal_name text default '',
  purchase_price_auec bigint default 0,
  rental_price_auec bigint default 0,
  source_name text not null,
  source_id text default '',
  source_url text default '',
  game_version text not null,
  environment text not null default 'LIVE' check (environment = 'LIVE'),
  confidence text not null default 'source',
  status text not null default 'active',
  source_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_catalog_locations_entity on public.catalog_locations(entity_name, game_version);
create index if not exists idx_catalog_locations_place on public.catalog_locations(system_name, body_name, location_name);

create table if not exists public.data_source_records (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  record_type text not null,
  source_id text not null,
  game_version text not null,
  environment text not null default 'LIVE',
  checksum text not null,
  raw_payload jsonb not null,
  imported_at timestamptz not null default now(),
  unique(source_name, record_type, source_id, game_version)
);

create table if not exists public.data_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  requested_by uuid references public.profiles(id),
  trigger_type text not null default 'manual',
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  live_version text not null,
  records_received integer not null default 0,
  records_published integer not null default 0,
  records_rejected integer not null default 0,
  error_message text default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.page_content (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  section_key text not null,
  title text default '',
  body text default '',
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(page_id, section_key)
);

create table if not exists public.page_backgrounds (
  id uuid primary key default gen_random_uuid(),
  page_id text unique not null,
  asset_path text not null,
  position text not null default 'center',
  overlay_strength numeric not null default 0.78 check (overlay_strength between 0 and 1),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blueprints add column if not exists external_key text;
alter table public.blueprints add column if not exists source_url text default '';
alter table public.blueprints add column if not exists source_payload jsonb not null default '{}'::jsonb;
create unique index if not exists idx_blueprints_external_key on public.blueprints(external_key) where external_key is not null;

alter table public.knowledge_locations add column if not exists external_key text;
alter table public.knowledge_locations add column if not exists source_url text default '';
alter table public.knowledge_locations add column if not exists source_updated_at timestamptz;
alter table public.knowledge_locations add column if not exists officer_locked boolean not null default false;
alter table public.knowledge_locations add column if not exists officer_notes text default '';
create unique index if not exists idx_knowledge_external_key on public.knowledge_locations(external_key) where external_key is not null;

alter table public.sync_sources add column if not exists enabled boolean not null default true;
alter table public.sync_sources add column if not exists auto_publish boolean not null default true;
alter table public.sync_sources add column if not exists base_url text default '';
alter table public.sync_sources add column if not exists last_error text default '';
alter table public.sync_sources add column if not exists last_run_at timestamptz;

insert into public.sync_sources(source_name, source_type, cadence, status, required_patch, notes, enabled, auto_publish, base_url) values
('Star Citizen Wiki game data','third-party','Daily','configured','4.8.3','Ships, vehicles, items, commodities, locations and blueprints. Only LIVE records are published.',true,true,'https://api.star-citizen.wiki/api'),
('UEX item and location data','third-party','Every 3 hours','awaiting-token','4.8.3','Community prices, terminals and trade data. Only LIVE-compatible records are published.',true,true,'https://api.uexcorp.uk/2.0')
on conflict(source_name) do update set base_url=excluded.base_url, enabled=true, auto_publish=true;

-- Apply updated_at triggers to new mutable tables.
do $$
declare t text;
begin
  foreach t in array array[
    'membership_applications','data_flags','game_catalog','catalog_locations',
    'page_content','page_backgrounds'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
