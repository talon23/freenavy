-- Free Navy administration console, member lifecycle controls and four-role hierarchy.
-- Safe to apply after 0001_free_navy_core.sql on an existing production database.

-- -----------------------------------------------------------------------------
-- Member profile and role migration
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists removed_at timestamptz;
alter table public.profiles add column if not exists removed_by uuid references public.profiles(id);
alter table public.profiles add column if not exists removal_reason text;
alter table public.profiles add column if not exists identity_deleted boolean not null default false;
alter table public.wikelo_projects add column if not exists submitted_by uuid references public.profiles(id);

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles
set role = case lower(role)
  when 'owner' then 'president'
  when 'admin' then 'vp'
  when 'treasurer' then 'vp'
  when 'quartermaster' then 'officer'
  when 'officer' then 'officer'
  when 'president' then 'president'
  when 'vp' then 'vp'
  when 'petty_officer' then 'petty_officer'
  else 'petty_officer'
end;
alter table public.profiles alter column role set default 'petty_officer';
alter table public.profiles add constraint profiles_role_check
  check (role in ('petty_officer','officer','vp','president'));

-- Richer audit detail without making the audit log editable.
alter table public.audit_log add column if not exists details jsonb;

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
alter table public.announcements add column if not exists status text not null default 'draft';
alter table public.announcements add column if not exists audience text not null default 'all';
alter table public.announcements add column if not exists published_at timestamptz;
alter table public.announcements add column if not exists expires_at timestamptz;

-- Announcements created under the original schema were already visible to members.
update public.announcements
set status='published', published_at=coalesce(published_at, created_at)
where status='draft' and published_at is null;

alter table public.announcements drop constraint if exists announcements_status_check;
alter table public.announcements add constraint announcements_status_check
  check (status in ('draft','published','archived'));
alter table public.announcements drop constraint if exists announcements_audience_check;
alter table public.announcements add constraint announcements_audience_check
  check (audience in ('all','members','officers','admins'));

-- -----------------------------------------------------------------------------
-- Website-managed content and settings
-- -----------------------------------------------------------------------------
create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_settings (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  nav_label text not null,
  title text not null,
  kicker text,
  hero_title text,
  hero_text text,
  background_url text,
  background_position text not null default 'center',
  overlay_strength numeric not null default 0.76 check (overlay_strength between 0.25 and 0.95),
  enabled boolean not null default true,
  member_submissions_enabled boolean not null default true,
  require_approval boolean not null default true,
  allowed_roles text[] not null default array['petty_officer','officer','vp','president']::text[],
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.page_settings add column if not exists allowed_roles text[] not null default array['petty_officer','officer','vp','president']::text[];
alter table public.page_settings drop constraint if exists page_settings_allowed_roles_check;

-- Convert any partially deployed old role arrays without losing custom page restrictions.
update public.page_settings p
set allowed_roles = coalesce((
  select array_agg(distinct mapped_role)
  from (
    select case lower(old_role)
      when 'owner' then 'president'
      when 'admin' then 'vp'
      when 'treasurer' then 'vp'
      when 'quartermaster' then 'officer'
      when 'officer' then 'officer'
      when 'president' then 'president'
      when 'vp' then 'vp'
      when 'petty_officer' then 'petty_officer'
      else 'petty_officer'
    end as mapped_role
    from unnest(p.allowed_roles) as r(old_role)
  ) mapped
), array['petty_officer','officer','vp','president']::text[]);

alter table public.page_settings alter column allowed_roles set default array['petty_officer','officer','vp','president']::text[];
alter table public.page_settings add constraint page_settings_allowed_roles_check check (
  allowed_roles <@ array['petty_officer','officer','vp','president']::text[]
  and cardinality(allowed_roles) > 0
);

create table if not exists public.page_content_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  block_key text,
  title text not null,
  body text,
  placement text not null default 'top' check (placement in ('top','bottom')),
  visibility text not null default 'members' check (visibility in ('members','officers','admins')),
  enabled boolean not null default true,
  sort_order integer not null default 100,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  identity_user_id uuid,
  email text not null,
  display_name text not null,
  role text not null default 'petty_officer',
  status text not null default 'sent' check (status in ('sent','accepted','cancelled','expired','failed')),
  sent_by uuid references public.profiles(id),
  sent_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_invitations drop constraint if exists member_invitations_role_check;
update public.member_invitations
set role = case lower(role)
  when 'owner' then 'president'
  when 'admin' then 'vp'
  when 'treasurer' then 'vp'
  when 'quartermaster' then 'officer'
  when 'officer' then 'officer'
  when 'president' then 'president'
  when 'vp' then 'vp'
  when 'petty_officer' then 'petty_officer'
  else 'petty_officer'
end;
alter table public.member_invitations alter column role set default 'petty_officer';
alter table public.member_invitations add constraint member_invitations_role_check
  check (role in ('petty_officer','officer','vp','president'));

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  record_table text not null,
  record_id uuid not null,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  notes text,
  moderator_id uuid not null references public.profiles(id),
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Default site configuration
-- -----------------------------------------------------------------------------
insert into public.site_settings(setting_key, value, description) values
('branding', '{"organisation_name":"Free Navy","portal_subtitle":"ORG COMMAND NETWORK","support_email":"","discord_invite":""}'::jsonb, 'Organisation branding and support links.'),
('public_home', '{"eyebrow":"INDEPENDENT. ORGANISED. READY.","title":"One secure bridge for the whole organisation.","lead":"Coordinate cargo, crafting, operations, fleet availability, member points, auctions and the Free Navy warehouse without exposing internal data to former members or rival organisations.","login_button":"Enter command portal"}'::jsonb, 'Public landing-page wording.'),
('membership', '{"default_role":"petty_officer","invite_only":true,"divisions":["Command","Industry","Logistics","Security","Medical","Exploration"]}'::jsonb, 'Membership defaults and selectable divisions.'),
('operations', '{"maintenance_mode":false,"maintenance_message":"The command network is temporarily undergoing maintenance."}'::jsonb, 'Portal operating controls.'),
('role_policy', '{"petty_officer":"Standard member access and submissions","officer":"Warehouse administration, invitations, petty-officer removal, approvals and announcements","vp":"Full website administration below the President","president":"Complete organisation control"}'::jsonb, 'Human-readable role policy shown in the administration console.')
on conflict (setting_key) do nothing;

-- Force the starting role to Petty Officer even if an older version stored "member".
update public.site_settings
set value = jsonb_set(coalesce(value,'{}'::jsonb), '{default_role}', '"petty_officer"'::jsonb, true), updated_at = now()
where setting_key = 'membership';

insert into public.page_settings(page_id,nav_label,title,kicker,hero_title,hero_text,background_url,member_submissions_enabled,require_approval,allowed_roles) values
('public','Public home','Free Navy','PUBLIC','Free Navy','Secure organisation command network.','/assets/backgrounds/public-home.svg',false,false,array['petty_officer','officer','vp','president']),
('dashboard','Command dashboard','Command dashboard','ORG STATUS','Free Navy command network','One connected operational picture: stock, jobs, crews, ships, threats and LIVE patch health.','/assets/backgrounds/dashboard-command.svg',false,false,array['petty_officer','officer','vp','president']),
('search','Network search','Network search','DATABANK','Search the organisation network','Find items, ships, members, coordinates, blueprints, jobs, operations and internal listings from one place.','/assets/backgrounds/search-databank.svg',false,false,array['petty_officer','officer','vp','president']),
('notifications','Notifications','Notifications','COMMS','Notifications','Organisation messages, approvals, jobs and operational updates.','/assets/backgrounds/notifications-comms.svg',false,false,array['petty_officer','officer','vp','president']),
('profile','My profile','My profile','PERSONNEL RECORD','My Free Navy profile','Maintain your display name, RSI handle, Discord handle and primary division.','/assets/backgrounds/members-roster.svg',false,false,array['petty_officer','officer','vp','president']),
('warehouse','Org warehouse','Org warehouse','LOGISTICS','Organisation warehouse','Shared stock, reservations, storage locations and minimum-level warnings.','/assets/backgrounds/warehouse-cargo.svg',false,false,array['petty_officer','officer','vp','president']),
('workorders','Work orders','Work orders','TASKING','Organisation work orders','Jobs generated from shortages, crafting demand and operational needs.','/assets/backgrounds/work-orders.svg',false,false,array['petty_officer','officer','vp','president']),
('crafting','Crafting & blueprints','Crafting & blueprints','PRODUCTION','Crafting and blueprints','Blueprint requirements, material shortages and production planning.','/assets/backgrounds/crafting-fabrication.svg',false,false,array['petty_officer','officer','vp','president']),
('refinery','Refinery command','Refinery command','PROCESSING','Refinery command','Track material processing, yields, collection deadlines and assigned haulers.','/assets/backgrounds/refinery-command.svg',false,false,array['petty_officer','officer','vp','president']),
('trade','UEX trade planner','UEX trade planner','COMMERCE','UEX trade planner','LIVE-only commodity calculations and trade-route planning.','/assets/backgrounds/trade-routes.svg',false,false,array['petty_officer','officer','vp','president']),
('knowledge','Where to buy / find','Where to buy / find','KNOWLEDGE','Where to buy and where to find','Trusted locations, live source data and member discoveries.','/assets/backgrounds/where-to-buy.svg',true,true,array['petty_officer','officer','vp','president']),
('mining','Mining operations','Mining operations','RESOURCE EXTRACTION','Mining operations','LIVE-verified mineral locations, coordinates, equipment and refinery routes.','/assets/backgrounds/mining-operations.svg',true,true,array['petty_officer','officer','vp','president']),
('salvaging','Salvaging operations','Salvaging operations','RECOVERY','Salvaging operations','Wreck locations, recovery methods, claims, yields and selling routes.','/assets/backgrounds/salvage-operations.svg',true,true,array['petty_officer','officer','vp','president']),
('auctions','Org auction house','Org auction house','POINTS ECONOMY','Organisation auction house','Bid organisation points on approved Free Navy lots.','/assets/backgrounds/auction-vault.svg',false,false,array['petty_officer','officer','vp','president']),
('market','Member marketplace','Member marketplace','INTERNAL TRADE','Member marketplace','Private member-to-member item and service listings.','/assets/backgrounds/member-market.svg',true,false,array['petty_officer','officer','vp','president']),
('contracts','Contract board','Contract board','JOBS','Contract board','Transport, escort, scouting, recovery and supply jobs.','/assets/backgrounds/contracts-board.svg',true,false,array['petty_officer','officer','vp','president']),
('treasury','Treasury & points','Treasury & points','ORG ECONOMY','Treasury and points','Donations, point balances and accountable organisation transactions.','/assets/backgrounds/treasury-ledger.svg',true,false,array['petty_officer','officer','vp','president']),
('operations','Operations','Operations','MISSION CONTROL','Operations','Plan and crew LIVE activities.','/assets/backgrounds/operations-briefing.svg',false,false,array['petty_officer','officer','vp','president']),
('crew','Crew finder','Crew finder','PERSONNEL AVAILABILITY','Crew finder','Availability, qualified roles, preferred activities and current locations.','/assets/backgrounds/crew-finder.svg',true,false,array['petty_officer','officer','vp','president']),
('fleet','Fleet readiness','Fleet readiness','ASSET COMMAND','Fleet readiness','Ships, loadouts, locations, readiness and organisation availability.','/assets/backgrounds/fleet-hangar.svg',true,false,array['petty_officer','officer','vp','president']),
('rescue','Medical & recovery','Medical & recovery','EMERGENCY RESPONSE','Medical and recovery','Coordinate rescue, medical assistance and ship recovery.','/assets/backgrounds/medical-rescue.svg',true,false,array['petty_officer','officer','vp','president']),
('exploration','Exploration & coordinates','Exploration & coordinates','NAVIGATION','Exploration and coordinates','Private navigation routes, triangulation notes and discoveries.','/assets/backgrounds/exploration-nav.svg',true,true,array['petty_officer','officer','vp','president']),
('intel','Intelligence','Intelligence','RESTRICTED REPORTING','Intelligence','Threats, route conditions, hostile activity and reconnaissance.','/assets/backgrounds/intelligence-recon.svg',true,true,array['petty_officer','officer','vp','president']),
('incidents','Incident reports','Incident reports','LESSONS LEARNED','Incident reports','Record operational incidents, losses and lessons learned.','/assets/backgrounds/incident-review.svg',true,true,array['petty_officer','officer','vp','president']),
('training','Training academy','Training academy','QUALIFICATIONS','Training academy','Courses, qualifications, mentors and readiness records.','/assets/backgrounds/training-academy.svg',false,false,array['petty_officer','officer','vp','president']),
('kits','Equipment kits','Equipment kits','READINESS','Equipment kits','Standard role kits, warehouse availability and substitutes.','/assets/backgrounds/equipment-kits.svg',false,false,array['petty_officer','officer','vp','president']),
('wikelo','Wikelo tracker','Wikelo tracker','REWARDS','Wikelo tracker','Track project requirements, contributions and rewards.','/assets/backgrounds/wikelo-rewards.svg',true,true,array['petty_officer','officer','vp','president']),
('members','Member directory','Member directory','PERSONNEL','Member directory','Organisation roster, handles, divisions, roles and qualifications.','/assets/backgrounds/members-roster.svg',false,false,array['petty_officer','officer','vp','president']),
('sync','LIVE source control','LIVE source control','PATCH GATEKEEPER','LIVE source control','The patch gatekeeper rejects test-server and stale operational data.','/assets/backgrounds/sync-control.svg',false,false,array['vp','president']),
('admin','Admin control','Admin control','RESTRICTED','Administration control','Manage invitations, members, approvals, announcements and website settings without opening the backend.','/assets/backgrounds/admin-control.svg',false,false,array['officer','vp','president']),
('backup','JSON backup','JSON backup','RESTRICTED DATA','JSON backup','Download a complete organisation data snapshot for safekeeping.','/assets/backgrounds/admin-control.svg',false,false,array['vp','president'])
on conflict (page_id) do nothing;

-- Correct access for installations where these rows already existed.
update public.page_settings set allowed_roles=array['officer','vp','president']::text[] where page_id='admin';
update public.page_settings set allowed_roles=array['vp','president']::text[] where page_id in ('sync','backup');
update public.page_settings set allowed_roles=array['petty_officer','officer','vp','president']::text[]
where page_id not in ('admin','sync','backup');

-- New mutable tables use the existing timestamp trigger from migration 0001.
do $$
declare t text;
begin
  foreach t in array array['site_settings','page_settings','page_content_blocks','member_invitations'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create index if not exists idx_page_content_page on public.page_content_blocks(page_id, enabled, sort_order);
create index if not exists idx_member_invitations_status on public.member_invitations(status, sent_at desc);
create index if not exists idx_moderation_actions_record on public.moderation_actions(record_table, record_id, created_at desc);
create index if not exists idx_profiles_role_status on public.profiles(role, status);
