-- Free Navy governance, departments, safety controls, watchlists, operations and backups.
-- This migration is additive and preserves all existing portal data.
-- Allow legacy profile roles used by the current server functions.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (
    role in (
      'owner',
      'admin',
      'officer',
      'quartermaster',
      'treasurer',
      'member',
      'petty_officer',
      'vp',
      'president'
    )
  );

create extension if not exists pgcrypto;

-- Member lifecycle and probation.
alter table public.profiles add column if not exists membership_stage text not null default 'full';
alter table public.profiles drop constraint if exists profiles_membership_stage_check;
alter table public.profiles add constraint profiles_membership_stage_check check (membership_stage in ('probationary','full','former'));
alter table public.profiles add column if not exists probation_ends_at timestamptz;
alter table public.profiles add column if not exists probation_notes text default '';
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists departed_at timestamptz;
alter table public.profiles add column if not exists account_notes text default '';
alter table public.profiles add column if not exists session_version integer not null default 1;

-- Concurrent appointments can be temporary and scoped.
alter table public.member_roles add column if not exists expires_at timestamptz;
alter table public.member_roles add column if not exists scope text default 'organisation';
alter table public.member_roles add column if not exists notes text default '';
alter table public.member_roles add column if not exists active boolean not null default true;
create index if not exists idx_member_roles_active on public.member_roles(profile_id, role, active, expires_at);

-- Departments and organisation chart.
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text default '',
  lead_member_id uuid references public.profiles(id) on delete set null,
  deputy_member_id uuid references public.profiles(id) on delete set null,
  enabled boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_departments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  department_role text not null default 'member' check (department_role in ('lead','deputy','officer','member')),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  unique(profile_id, department_id)
);

insert into public.departments(name, description, sort_order) values
('Command','Organisation leadership, policy and strategic direction.',10),
('Mining','Resource extraction, scouting and refinery supply.',20),
('Salvage','Wreck recovery, component recovery and material processing.',30),
('Logistics','Cargo, warehouse, transport and supply-chain operations.',40),
('Security','Fleet protection, ground security and response operations.',50),
('Medical','Medical rescue, recovery and casualty support.',60),
('Exploration','Navigation, coordinates, scouting and discovery.',70),
('Engineering and Crafting','Blueprints, fabrication, ship engineering and production.',80),
('Trade','Commodity trading, market intelligence and route planning.',90),
('Recruitment','Applications, induction and probation support.',100),
('Intelligence','Threat reporting and restricted operational intelligence.',110)
on conflict(name) do nothing;

-- Capability overrides. Protected capabilities remain code-controlled.
create table if not exists public.role_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('rank','appointment')),
  subject_key text not null,
  capability text not null,
  enabled boolean not null,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_type, subject_key, capability)
);

create table if not exists public.member_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null,
  enabled boolean not null,
  reason text default '',
  expires_at timestamptz,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id, capability)
);

-- Private daily recruitment links, with revocation and use limits.
create table if not exists public.registration_links (
  id uuid primary key default gen_random_uuid(),
  token_date date not null,
  generation integer not null default 1,
  max_uses integer not null default 25 check (max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(token_date, generation)
);
create index if not exists idx_registration_links_current on public.registration_links(token_date, revoked_at, expires_at);

alter table public.membership_applications add column if not exists registration_link_id uuid references public.registration_links(id) on delete set null;
alter table public.membership_applications add column if not exists referrer_name text default '';
alter table public.membership_applications add column if not exists requested_department text default '';
alter table public.membership_applications add column if not exists probation_days integer not null default 14 check (probation_days between 0 and 365);

-- Record history and member watchlists.
create table if not exists public.record_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text default '',
  source_name text default '',
  actor_id uuid references public.profiles(id),
  game_version text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_record_history_entity on public.record_history(entity_type, entity_id, created_at desc);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  entity_name text not null,
  alert_types text[] not null default array['changed']::text[],
  created_at timestamptz not null default now(),
  unique(member_id, entity_type, entity_id)
);

-- Patch reconfirmation campaigns.
create table if not exists public.verification_campaigns (
  id uuid primary key default gen_random_uuid(),
  game_version text not null,
  title text not null,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  unique(game_version)
);

create table if not exists public.verification_tasks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.verification_campaigns(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  entity_name text not null,
  category text default '',
  status text not null default 'open' check (status in ('open','claimed','confirmed','rejected','cancelled')),
  claimed_by uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  reward_points integer not null default 0,
  evidence_url text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, entity_type, entity_id)
);

-- Configurable feature switches and site settings.
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text unique not null,
  label text not null,
  enabled boolean not null default true,
  description text default '',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value jsonb not null default '{}'::jsonb,
  description text default '',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility with 0002_admin_console, which originally created this table
-- with a column named `value`. CREATE TABLE IF NOT EXISTS does not add missing
-- columns to an existing table, so add and backfill the newer column explicitly.
alter table public.site_settings
  add column if not exists setting_value jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'site_settings'
      and column_name = 'value'
  ) then
    update public.site_settings
    set setting_value = coalesce(setting_value, value, '{}'::jsonb)
    where setting_value is null;
  else
    update public.site_settings
    set setting_value = coalesce(setting_value, '{}'::jsonb)
    where setting_value is null;
  end if;
end $$;

alter table public.site_settings
  alter column setting_value set default '{}'::jsonb;
alter table public.site_settings
  alter column setting_value set not null;

insert into public.feature_flags(feature_key,label,enabled,description) values
('crafting','Crafting and blueprints',true,'Blueprint, materials and production modules.'),
('wikelo','Wikelo tracker',true,'Wikelo projects and reward tracking.'),
('intelligence','Intelligence reports',true,'Restricted threat and intelligence reports.'),
('auctions','Organisation auctions',true,'Points-based organisation auctions.'),
('marketplace','Member marketplace',true,'Member-to-member listings.'),
('treasury','Treasury and points',true,'Treasury, donations and points ledger.'),
('recruitment','Private recruitment',true,'Daily private application links and application review.'),
('knowledge_base','Knowledge base',true,'Organisation guides and procedures.'),
('watchlists','Watchlists',true,'Personal watched records and alerts.'),
('discord_webhooks','Discord webhooks',false,'Deliberately disabled. No automated Discord posting.'),
('discord_oauth','Discord account verification',false,'Deliberately disabled. Discord handle remains a text profile field only.')
on conflict(feature_key) do update set label=excluded.label, description=excluded.description;

insert into public.site_settings(setting_key,setting_value,description) values
('high_value_warehouse_threshold','{"auec":1000000}'::jsonb,'Estimated value above which two approvals are required.'),
('high_value_points_threshold','{"points":5000}'::jsonb,'Absolute points adjustment requiring a second approval.'),
('default_probation_days','{"days":14}'::jsonb,'Default probation period after applicant approval.'),
('backup_retention','{"daily_days":14,"weekly_weeks":8}'::jsonb,'Scheduled JSON backup retention.'),
('discord_integration','{"enabled":false}'::jsonb,'Discord integration is intentionally disabled.')
on conflict(setting_key) do nothing;

alter table public.warehouse_items add column if not exists estimated_unit_value_auec bigint not null default 0;

-- Generic two-person approvals for high-value actions.
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  entity_type text not null,
  entity_id text not null,
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid not null references public.profiles(id),
  required_capability text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','executed')),
  approved_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text default '',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_approval_requests_status on public.approval_requests(status, request_type, created_at desc);

-- Warehouse checkout and return chain.
create table if not exists public.equipment_loans (
  id uuid primary key default gen_random_uuid(),
  warehouse_item_id uuid references public.warehouse_items(id) on delete set null,
  item_name text not null,
  quantity numeric not null default 1,
  unit text default 'unit',
  member_id uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  issued_by uuid references public.profiles(id),
  returned_to uuid references public.profiles(id),
  status text not null default 'requested' check (status in ('requested','approved','issued','returned','consumed','lost','rejected')),
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  due_at timestamptz,
  returned_at timestamptz,
  condition_out text default '',
  condition_in text default '',
  evidence_url text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reusable operation templates and live command-room data.
create table if not exists public.operation_templates (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  operation_type text not null,
  default_location text default '',
  required_roles text default '',
  briefing_template text default '',
  default_reward_points integer not null default 0,
  checklist jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.operations add column if not exists template_id uuid references public.operation_templates(id) on delete set null;
alter table public.operations add column if not exists current_phase text default 'briefing';
alter table public.operations add column if not exists voice_channel text default '';
alter table public.operations add column if not exists emergency_status text not null default 'normal' check (emergency_status in ('normal','attention','emergency'));
alter table public.operations add column if not exists objective_status text default '';
alter table public.operations add column if not exists live_notes text default '';

alter table public.operation_attendance add column if not exists joined_at timestamptz;
alter table public.operation_attendance add column if not exists left_at timestamptz;
alter table public.operation_attendance add column if not exists minutes_attended integer not null default 0;
alter table public.operation_attendance add column if not exists materials_contributed numeric not null default 0;
alter table public.operation_attendance add column if not exists cargo_transported numeric not null default 0;
alter table public.operation_attendance add column if not exists ship_supplied text default '';
alter table public.operation_attendance add column if not exists rescue_actions integer not null default 0;
alter table public.operation_attendance add column if not exists objectives_completed integer not null default 0;
alter table public.operation_attendance add column if not exists officer_commendation text default '';
alter table public.operation_attendance add column if not exists calculated_points integer not null default 0;
alter table public.operation_attendance add column if not exists approved_points integer;
alter table public.operation_attendance add column if not exists points_approved_by uuid references public.profiles(id);

create table if not exists public.operation_updates (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  update_type text not null default 'status' check (update_type in ('status','objective','coordinate','warning','loss','announcement')),
  message text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.operation_templates(name,operation_type,required_roles,briefing_template,checklist) values
('MOLE mining operation','Mining','Commander; MOLE pilot; laser operators; cargo support; escort','Confirm target material, mining area, refinery destination, crew channels and security plan.','["Confirm LIVE patch","Assign laser operators","Confirm refinery route","Check cargo support","Complete after-action report"]'::jsonb),
('Reclaimer salvage operation','Salvage','Commander; Reclaimer pilot; salvage operators; cargo operator; escort','Confirm salvage area, wreck claim, cargo support, sale route and threat level.','["Confirm wreck availability","Assign salvage stations","Confirm cargo plan","Record recovered components","Complete after-action report"]'::jsonb),
('Cargo convoy','Logistics','Convoy commander; haulers; escorts; scouts','Confirm cargo manifest, route, alternates, refuel stops and escort formation.','["Confirm manifests","Assign formation","Confirm alternate route","Run threat brief","Record deliveries"]'::jsonb),
('Medical response','Medical','Response commander; medical crew; security; transport','Confirm casualty location, threat, treatment plan and extraction route.','["Confirm coordinates","Assign medical ship","Assess threat","Extract casualty","Close rescue request"]'::jsonb),
('Security patrol','Security','Patrol commander; pilots; ground security; medical support','Confirm patrol area, rules of engagement, comms and response thresholds.','["Confirm patrol route","Assign teams","Check medical support","Log contacts","Complete report"]'::jsonb),
('Blueprint material collection','Crafting','Production lead; miners; salvagers; haulers; quartermaster','Confirm blueprint demand, shortages, collection routes and warehouse delivery.','["Lock blueprint target","Create shortages","Assign collection teams","Confirm delivery","Start production job"]'::jsonb),
('Fleet exercise','Fleet','Fleet commander; ship captains; engineers; medical support','Confirm exercise objectives, formations, ship roles and safety rules.','["Publish objectives","Assign ships","Confirm imprints","Run exercise","Record lessons"]'::jsonb),
('Exploration expedition','Exploration','Expedition lead; scouts; navigation; security; medical support','Confirm route, waypoints, environmental hazards and recording standards.','["Confirm route","Assign scouts","Record coordinates","Capture evidence","Publish verified findings"]'::jsonb)
on conflict(name) do nothing;

-- Editable organisation guides and revision history.
create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text not null default 'General',
  summary text default '',
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  audience text not null default 'members' check (audience in ('members','officers','command')),
  current_revision integer not null default 1,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.knowledge_articles(id) on delete cascade,
  revision_number integer not null,
  title text not null,
  summary text default '',
  body text not null,
  change_note text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(article_id, revision_number)
);

-- Scheduled and manual backup metadata. Payloads live in Netlify Blobs.
create table if not exists public.backup_records (
  id uuid primary key default gen_random_uuid(),
  backup_key text unique not null,
  backup_type text not null check (backup_type in ('manual','daily','weekly','pre_import')),
  status text not null default 'completed' check (status in ('running','completed','failed','deleted')),
  table_count integer not null default 0,
  row_count bigint not null default 0,
  size_bytes bigint not null default 0,
  checksum text default '',
  created_by uuid references public.profiles(id),
  error_message text default '',
  created_at timestamptz not null default now()
);

-- Import safety controls and health counters.
alter table public.sync_sources add column if not exists paused boolean not null default false;
alter table public.sync_sources add column if not exists dry_run_supported boolean not null default true;
alter table public.sync_sources add column if not exists zero_result_protection boolean not null default true;
alter table public.sync_sources add column if not exists records_received integer not null default 0;
alter table public.sync_sources add column if not exists records_published integer not null default 0;
alter table public.sync_sources add column if not exists records_rejected integer not null default 0;
alter table public.sync_sources add column if not exists consecutive_failures integer not null default 0;
alter table public.sync_sources add column if not exists next_run_at timestamptz;

-- Trigger coverage for new mutable tables.
do $$
declare t text;
begin
  foreach t in array array[
    'departments','role_capability_overrides','member_capability_overrides','verification_tasks',
    'feature_flags','site_settings','approval_requests','equipment_loans','operation_templates',
    'knowledge_articles'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create index if not exists idx_watchlists_member on public.watchlists(member_id, entity_type);
create index if not exists idx_verification_tasks_status on public.verification_tasks(campaign_id, status);
create index if not exists idx_equipment_loans_status on public.equipment_loans(status, member_id);
create index if not exists idx_operation_updates_operation on public.operation_updates(operation_id, created_at desc);
create index if not exists idx_knowledge_articles_status on public.knowledge_articles(status, audience, category);
create index if not exists idx_backup_records_created on public.backup_records(created_at desc);

-- Lightweight abuse protection for the private membership form.
create table if not exists public.application_rate_limits (
  client_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Recruitment blocks are managed from the portal and checked before applications are accepted.
create table if not exists public.recruitment_blocks (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  reason text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
