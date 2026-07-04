-- Free Navy Netlify Database baseline
-- Applied automatically by Netlify Database during deploy.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  email text,
  display_name text not null default 'Member',
  rsi_handle text default '',
  discord_handle text default '',
  role text not null default 'member' check (role in ('owner','admin','officer','quartermaster','treasurer','member')),
  status text not null default 'invited' check (status in ('invited','active','inactive','banned')),
  points_balance bigint not null default 0,
  primary_division text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.live_patch_records (
 id text primary key, environment text not null default 'LIVE', version text not null, released_at timestamptz,
 source_name text, source_url text, status text default 'active', checked_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(), title text not null, body text, priority text default 'normal', created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references profiles(id) on delete cascade, title text not null, message text, category text, read_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.warehouse_items (
 id uuid primary key default gen_random_uuid(), name text not null, category text, quantity numeric default 0, reserved_quantity numeric default 0, unit text, storage_location text, condition text, status text default 'available', minimum_stock numeric default 0, image_url text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.inventory_movements (
 id uuid primary key default gen_random_uuid(), item_name text not null, quantity numeric default 0, unit text, movement_type text, from_location text, to_location text, member_id uuid references profiles(id), linked_record text, status text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.blueprints (
 id uuid primary key default gen_random_uuid(), name text not null, category text, status text, quality_target numeric default 0, active boolean default false, source text, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.blueprint_materials (
 id uuid primary key default gen_random_uuid(), blueprint_id uuid not null references blueprints(id) on delete cascade, material_name text not null, quantity numeric default 0, unit text, quality_min numeric default 0, created_at timestamptz default now()
);
create table if not exists public.production_jobs (
 id uuid primary key default gen_random_uuid(), blueprint_name text not null, quantity numeric default 0, quality_target numeric default 0, status text, assigned_to uuid references profiles(id), output_location text, due_at timestamptz, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.work_orders (
 id uuid primary key default gen_random_uuid(), title text not null, category text, item_name text, target_quantity numeric default 0, current_quantity numeric default 0, unit text, reward_points bigint default 0, reward_auec bigint default 0, priority text, status text default 'open', claimed_by uuid references profiles(id), linked_module text, deadline timestamptz, game_version text not null, description text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.refinery_jobs (
 id uuid primary key default gen_random_uuid(), material_name text not null, raw_quantity numeric default 0, expected_yield numeric default 0, unit text, refinery_location text, refining_method text, cost_auec bigint default 0, status text, owner_id uuid references profiles(id), hauler_id uuid references profiles(id), completes_at timestamptz, collection_deadline timestamptz, destination text, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.knowledge_locations (
 id uuid primary key default gen_random_uuid(), item_name text not null, category text, location_name text, system_name text, body_name text, terminal_name text, coordinates text, source_type text, game_version text not null, confidence text default 'pending', confirmations integer default 0, status text default 'pending', price_auec bigint default 0, last_confirmed_at timestamptz, submitted_by uuid references profiles(id), notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.mining_locations (
 id uuid primary key default gen_random_uuid(), material_name text not null, system_name text, body_name text, location_name text, mining_method text, coordinates text, nearby_marker text, concentration text, risk_level text, ship_recommendation text, refinery_route text, source_type text, game_version text not null, confidence text default 'pending', confirmations integer default 0, status text default 'pending', last_confirmed_at timestamptz, submitted_by uuid references profiles(id), notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.salvage_locations (
 id uuid primary key default gen_random_uuid(), material_name text not null, system_name text, body_name text, location_name text, salvage_method text, coordinates text, nearby_marker text, expected_yield text, risk_level text, ship_recommendation text, sale_route text, source_type text, game_version text not null, confidence text default 'pending', confirmations integer default 0, status text default 'pending', expires_at timestamptz, last_confirmed_at timestamptz, submitted_by uuid references profiles(id), notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.wreck_reports (
 id uuid primary key default gen_random_uuid(), title text not null, system_name text, location_name text, coordinates text, ship_type text, salvage_remaining text, cargo_found text, reported_by uuid references profiles(id), claimed_by uuid references profiles(id), status text, expires_at timestamptz, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.auctions (
 id uuid primary key default gen_random_uuid(), title text not null, description text, starting_bid bigint default 0, current_bid bigint default 0, current_winner_id uuid references profiles(id), status text default 'open', ends_at timestamptz, image_url text, created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.auction_bids (
 id uuid primary key default gen_random_uuid(), auction_id uuid references auctions(id) on delete cascade, bidder_id uuid references profiles(id), amount bigint not null, created_at timestamptz default now()
);
create table if not exists public.market_listings (
 id uuid primary key default gen_random_uuid(), title text not null, listing_type text, price_auec bigint default 0, price_points bigint default 0, quantity numeric default 1, seller_id uuid references profiles(id), location text, status text default 'active', game_version text not null, description text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.contracts (
 id uuid primary key default gen_random_uuid(), title text not null, category text, reward_auec bigint default 0, reward_points bigint default 0, location text, status text default 'open', claimed_by uuid references profiles(id), deadline timestamptz, game_version text not null, description text, created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.operations (
 id uuid primary key default gen_random_uuid(), title text not null, operation_type text, start_at timestamptz, end_at timestamptz, location text, status text default 'scheduled', commander_id uuid references profiles(id), required_roles text, reward_points bigint default 0, game_version text not null, briefing text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.operation_attendance (
 id uuid primary key default gen_random_uuid(), operation_id uuid references operations(id) on delete cascade, member_id uuid references profiles(id) on delete cascade, status text, crew_role text, created_at timestamptz default now(), updated_at timestamptz default now(), unique(operation_id,member_id)
);
create table if not exists public.crew_availability (
 id uuid primary key default gen_random_uuid(), member_id uuid references profiles(id) on delete cascade, availability text, available_from timestamptz, available_until timestamptz, preferred_activities text, qualified_roles text, current_location text, voice_available boolean default false, status text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.fleet_ships (
 id uuid primary key default gen_random_uuid(), ship_name text not null, variant text, owner_id uuid references profiles(id), org_owned boolean default false, role text, status text default 'available', home_location text, fuel_percent numeric default 100, hull_percent numeric default 100, crew_required integer default 1, loadout_imprinted boolean default false, reserved_by text, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.rescue_requests (
 id uuid primary key default gen_random_uuid(), title text not null, request_type text, requester_id uuid references profiles(id), system_name text, location_name text, coordinates text, threat_level text, status text default 'open', responder_id uuid references profiles(id), ship_required text, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.exploration_routes (
 id uuid primary key default gen_random_uuid(), name text not null, system_name text, route_type text, waypoint_count integer default 0, start_marker text, end_marker text, coordinates text, visibility text, status text default 'pending', game_version text not null, submitted_by uuid references profiles(id), notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.intel_reports (
 id uuid primary key default gen_random_uuid(), title text not null, category text, system_name text, location_name text, threat_level text, classification text, status text default 'unverified', details text, reported_by uuid references profiles(id), expires_at timestamptz, game_version text not null, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.incident_reports (
 id uuid primary key default gen_random_uuid(), title text not null, category text, severity text, location text, status text default 'open', reported_by uuid references profiles(id), occurred_at timestamptz, details text, game_version text not null, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.training_courses (
 id uuid primary key default gen_random_uuid(), title text not null, category text, instructor_id uuid references profiles(id), start_at timestamptz, seats integer default 0, points_reward bigint default 0, status text, description text, game_version text not null, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.member_qualifications (
 id uuid primary key default gen_random_uuid(), member_id uuid references profiles(id) on delete cascade, qualification text not null, level text, mentor_id uuid references profiles(id), awarded_at timestamptz, expires_at timestamptz, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.equipment_kits (
 id uuid primary key default gen_random_uuid(), name text not null, category text, required_items text, warehouse_status text, reserve_status text, estimated_cost_auec bigint default 0, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.wikelo_projects (
 id uuid primary key default gen_random_uuid(), name text not null, category text, target_quantity numeric default 0, current_quantity numeric default 0, unit text, status text, game_version text not null, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.donations (
 id uuid primary key default gen_random_uuid(), member_id uuid references profiles(id), amount bigint default 0, donation_type text, purpose text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.points_ledger (
 id uuid primary key default gen_random_uuid(), member_id uuid references profiles(id), amount bigint not null, reason text not null, linked_record text, created_by uuid references profiles(id), created_at timestamptz default now()
);
create table if not exists public.sync_sources (
 id uuid primary key default gen_random_uuid(), source_name text unique not null, source_type text, cadence text, status text, required_patch text, last_success_at timestamptz, records_changed integer default 0, notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.live_confirmations (
 id uuid primary key default gen_random_uuid(), record_table text not null check(record_table in ('knowledge_locations','mining_locations','salvage_locations')), record_id uuid not null, member_id uuid not null references profiles(id) on delete cascade, game_version text not null, confirmed_at timestamptz default now(), unique(record_table,record_id,member_id,game_version)
);
create table if not exists public.audit_log (
 id uuid primary key default gen_random_uuid(), actor_id uuid references profiles(id), action text not null, entity_type text, entity_name text, created_at timestamptz default now()
);

-- Keep updated_at consistent across mutable tables.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','live_patch_records','announcements','notifications','warehouse_items','inventory_movements',
    'blueprints','production_jobs','work_orders','refinery_jobs','knowledge_locations','mining_locations',
    'salvage_locations','wreck_reports','auctions','market_listings','contracts','operations','operation_attendance',
    'crew_availability','fleet_ships','rescue_requests','exploration_routes','intel_reports','incident_reports',
    'training_courses','member_qualifications','equipment_kits','wikelo_projects','donations','sync_sources'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Query and workflow indexes.
create index if not exists idx_notifications_member_read on public.notifications(member_id, read_at);
create index if not exists idx_work_orders_status on public.work_orders(status);
create index if not exists idx_operations_start on public.operations(start_at);
create index if not exists idx_warehouse_name on public.warehouse_items(name);
create index if not exists idx_knowledge_item_patch on public.knowledge_locations(item_name, game_version);
create index if not exists idx_mining_material_patch on public.mining_locations(material_name, game_version);
create index if not exists idx_salvage_material_patch on public.salvage_locations(material_name, game_version);
create index if not exists idx_audit_created on public.audit_log(created_at desc);

insert into public.live_patch_records(id, environment, version, source_name, status)
values ('current-live', 'LIVE', '4.8.3', 'Configured LIVE fallback', 'active')
on conflict (id) do nothing;

insert into public.sync_sources(source_name, source_type, cadence, status, required_patch, notes) values
('Official RSI LIVE version','official','Every 3 hours','configured','4.8.3','Accepts only official patch notes explicitly marked LIVE.'),
('UEX commodities and routes','third-party','On demand','awaiting-token','4.8.3','Rows with a conflicting game version are rejected.'),
('Free Navy member verification','member','Live','configured','4.8.3','Member confirmations are unique per record and LIVE patch.')
on conflict (source_name) do nothing;
