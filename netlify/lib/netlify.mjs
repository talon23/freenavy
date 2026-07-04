import { getConnectionString } from "@netlify/database";
import { getUser, verifyRequestOrigin } from "@netlify/identity";
import pg from "pg";

const { Pool } = pg;
let pool;

export const RANKS = [
  "president","vice_president","general","admiral","vice_admiral",
  "rear_admiral","brigadier_general","officer","enlisted"
];
export const APPOINTMENTS = ["admin","quartermaster","treasurer"];
export const CAPABILITY_KEYS = [
  "view_portal","view_sensitive","manage_site","manage_members","approve_applications","assign_ranks",
  "assign_appointments","view_signup_link","manage_signup_link","manage_warehouse","manage_treasury",
  "edit_game_data","approve_game_data","manage_operations","manage_training","manage_departments",
  "manage_imports","manage_features","manage_permissions","manage_backups","restore_backups","flag_data",
  "submit_locations","manage_knowledge","manage_approvals","manage_identity"
];
export const PROTECTED_CAPABILITIES = new Set([
  "assign_ranks","assign_appointments","manage_permissions","restore_backups","manage_identity"
]);
const RANK_LEVEL = {
  enlisted: 100,
  officer: 200,
  brigadier_general: 300,
  rear_admiral: 300,
  vice_admiral: 300,
  admiral: 400,
  general: 400,
  vice_president: 500,
  president: 600
};

export const TABLES = new Set([
  "profiles","member_roles","membership_applications","registration_links","recruitment_blocks","live_patch_records","announcements","notifications",
  "warehouse_items","inventory_movements","equipment_loans","approval_requests","blueprints","blueprint_materials","production_jobs","work_orders",
  "refinery_jobs","knowledge_locations","mining_locations","salvage_locations","wreck_reports","auctions",
  "auction_bids","market_listings","contracts","operations","operation_attendance","operation_templates","operation_updates","crew_availability",
  "fleet_ships","rescue_requests","exploration_routes","intel_reports","incident_reports","training_courses",
  "member_qualifications","equipment_kits","wikelo_projects","donations","points_ledger","sync_sources",
  "live_confirmations","audit_log","data_flags","game_catalog","catalog_locations","data_source_records",
  "data_import_runs","page_content","page_backgrounds","departments","member_departments",
  "role_capability_overrides","member_capability_overrides","record_history","watchlists",
  "verification_campaigns","verification_tasks","feature_flags","site_settings","knowledge_articles",
  "knowledge_article_revisions","backup_records"
]);

export const GAME_VERSION_TABLES = new Set([
  "blueprints","production_jobs","work_orders","refinery_jobs","knowledge_locations","mining_locations",
  "salvage_locations","wreck_reports","market_listings","contracts","operations","rescue_requests",
  "exploration_routes","intel_reports","incident_reports","training_courses","member_qualifications",
  "equipment_kits","wikelo_projects","game_catalog","catalog_locations","data_source_records","verification_campaigns"
]);

export const OWNER_FIELDS = {
  market_listings: "seller_id", contracts: "created_by", crew_availability: "member_id",
  fleet_ships: "owner_id", rescue_requests: "requester_id", exploration_routes: "submitted_by",
  intel_reports: "reported_by", incident_reports: "reported_by", knowledge_locations: "submitted_by",
  mining_locations: "submitted_by", salvage_locations: "submitted_by", wreck_reports: "reported_by",
  donations: "member_id", data_flags: "reported_by", watchlists: "member_id", equipment_loans: "member_id"
};

const MEMBER_CREATE = new Set([
  "market_listings","contracts","crew_availability","fleet_ships","rescue_requests","exploration_routes",
  "intel_reports","incident_reports","knowledge_locations","mining_locations","salvage_locations","wreck_reports",
  "wikelo_projects","donations","data_flags","watchlists","equipment_loans"
]);
const MEMBER_EDIT_OWN = new Set([
  "market_listings","crew_availability","fleet_ships","rescue_requests","profiles","watchlists","equipment_loans"
]);
const RPC_ONLY = new Set([
  "auction_bids","operation_attendance","points_ledger","live_confirmations","inventory_movements","audit_log",
  "member_roles","membership_applications","registration_links","data_import_runs","data_source_records",
  "member_departments","role_capability_overrides","member_capability_overrides","record_history",
  "verification_campaigns","verification_tasks","backup_records","approval_requests","knowledge_article_revisions"
]);
const ADMIN_READ = new Set([
  "audit_log","sync_sources","live_patch_records","data_import_runs","data_source_records","record_history",
  "role_capability_overrides","member_capability_overrides","registration_links","recruitment_blocks","backup_records","site_settings"
]);

export function dbPool() {
  if (!pool) pool = new Pool({ connectionString: getConnectionString(), max: 4, allowExitOnIdle: true });
  return pool;
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function errorResponse(error) {
  console.error(error);
  return json({ error: error?.message || "Unexpected server error." }, error?.status || error?.statusCode || 500);
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function assertSameOrigin(request) {
  try { verifyRequestOrigin(request); }
  catch { throw httpError(403, "Request origin was rejected."); }
}

export function ident(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(value || ""))) throw httpError(400, "Invalid database identifier.");
  return `"${String(value).replaceAll('"','""')}"`;
}

function identityRoles(user) {
  return [
    ...(Array.isArray(user?.roles) ? user.roles : []),
    user?.role,
    ...(Array.isArray(user?.appMetadata?.roles) ? user.appMetadata.roles : [])
  ].filter(Boolean).map((value) => String(value).toLowerCase());
}

export function rankLevel(profileOrRank) {
  const rank = typeof profileOrRank === "string" ? profileOrRank : profileOrRank?.rank;
  return RANK_LEVEL[rank] || 0;
}
export function isOfficerUp(profile) { return rankLevel(profile) >= RANK_LEVEL.officer; }
export function isExecutive(profile) { return ["president","vice_president"].includes(profile?.rank); }
export function isPresident(profile) { return profile?.rank === "president"; }
export function hasAppointment(profile, role) { return Array.isArray(profile?.roles) && profile.roles.includes(role); }
export function isProbationary(profile) { return profile?.membership_stage === "probationary"; }

function defaultCapabilities(profile) {
  const executive = isExecutive(profile);
  const officer = isOfficerUp(profile);
  const adminAppointment = hasAppointment(profile, "admin");
  const quartermaster = hasAppointment(profile, "quartermaster");
  const treasurer = hasAppointment(profile, "treasurer");
  const probationary = isProbationary(profile);
  return {
    view_portal: true,
    view_sensitive: !probationary && officer,
    manage_site: executive || adminAppointment,
    manage_members: executive || adminAppointment,
    approve_applications: officer || adminAppointment,
    assign_ranks: executive,
    assign_appointments: executive,
    view_signup_link: officer,
    manage_signup_link: officer,
    manage_warehouse: !probationary && (executive || quartermaster),
    manage_treasury: !probationary && (executive || treasurer),
    edit_game_data: officer || adminAppointment,
    approve_game_data: officer || adminAppointment,
    manage_operations: officer,
    manage_training: officer,
    manage_departments: executive || adminAppointment,
    manage_imports: officer || adminAppointment,
    manage_features: executive || adminAppointment,
    manage_permissions: executive,
    manage_backups: executive || adminAppointment,
    restore_backups: isPresident(profile),
    flag_data: true,
    submit_locations: true,
    manage_knowledge: officer || adminAppointment,
    manage_approvals: executive || quartermaster || treasurer,
    manage_identity: executive || adminAppointment
  };
}

export function capabilities(profile) {
  const result = defaultCapabilities(profile);
  const overrides = profile?.capability_overrides || {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!CAPABILITY_KEYS.includes(key) || PROTECTED_CAPABILITIES.has(key)) continue;
    result[key] = Boolean(value);
  }
  // Protected capabilities are always derived from rank and cannot be granted by an override.
  result.assign_ranks = isExecutive(profile);
  result.assign_appointments = isExecutive(profile);
  result.manage_permissions = isExecutive(profile);
  result.restore_backups = isPresident(profile);
  result.manage_identity = isExecutive(profile) || hasAppointment(profile, "admin");
  if (isProbationary(profile)) {
    result.view_sensitive = false;
    result.manage_warehouse = false;
    result.manage_treasury = false;
  }
  return result;
}

export function hasCapability(profile, key) {
  return Boolean(profile?.capabilities?.[key] ?? capabilities(profile)[key]);
}
export function canManageSite(profile) { return hasCapability(profile, "manage_site"); }
export function canManageMembers(profile) { return hasCapability(profile, "manage_members"); }
export function canApproveApplications(profile) { return hasCapability(profile, "approve_applications"); }
export function canAssignRanks(profile) { return hasCapability(profile, "assign_ranks"); }
export function canAssignAppointments(profile) { return hasCapability(profile, "assign_appointments"); }
export function canViewSignupLink(profile) { return hasCapability(profile, "view_signup_link"); }
export function canManageSignupLink(profile) { return hasCapability(profile, "manage_signup_link"); }
export function canManageWarehouse(profile) { return hasCapability(profile, "manage_warehouse"); }
export function canManageTreasury(profile) { return hasCapability(profile, "manage_treasury"); }
export function canEditGameData(profile) { return hasCapability(profile, "edit_game_data"); }
export function canManageImports(profile) { return hasCapability(profile, "manage_imports"); }
export function canManageFeatures(profile) { return hasCapability(profile, "manage_features"); }
export function canManagePermissions(profile) { return hasCapability(profile, "manage_permissions"); }
export function canManageBackups(profile) { return hasCapability(profile, "manage_backups"); }
export function canRestoreBackups(profile) { return hasCapability(profile, "restore_backups"); }
export function isAdmin(profile) { return canManageSite(profile); }

export function canManage(profile, table) {
  if (isExecutive(profile)) return true;
  if (["page_content","page_backgrounds","feature_flags","site_settings"].includes(table)) return canManageSite(profile);
  if (["sync_sources","data_import_runs","data_source_records","live_patch_records"].includes(table)) return canManageImports(profile);
  if (["warehouse_items","inventory_movements","refinery_jobs","equipment_kits","equipment_loans"].includes(table)) return canManageWarehouse(profile);
  if (["donations","points_ledger","auctions","auction_bids"].includes(table)) return canManageTreasury(profile);
  if (["blueprints","blueprint_materials","production_jobs","knowledge_locations","mining_locations","salvage_locations","game_catalog","catalog_locations","data_flags","verification_tasks"].includes(table)) return canEditGameData(profile);
  if (table === "announcements") return isOfficerUp(profile) || canManageSite(profile);
  if (["work_orders","contracts","operations","operation_attendance","operation_templates","operation_updates","crew_availability","fleet_ships","rescue_requests","exploration_routes","intel_reports","incident_reports","training_courses","member_qualifications","wikelo_projects"].includes(table)) return hasCapability(profile, "manage_operations") || isOfficerUp(profile);
  if (["knowledge_articles","knowledge_article_revisions"].includes(table)) return hasCapability(profile, "manage_knowledge");
  if (["profiles","departments","member_departments","recruitment_blocks"].includes(table)) return canManageMembers(profile);
  if (["role_capability_overrides","member_capability_overrides"].includes(table)) return canManagePermissions(profile);
  if (["backup_records"].includes(table)) return canManageBackups(profile);
  if (["approval_requests"].includes(table)) return hasCapability(profile, "manage_approvals");
  return false;
}

export async function currentLiveVersion(client = dbPool()) {
  const result = await client.query("select version from public.live_patch_records where id='current-live' and environment='LIVE' and status='active' limit 1");
  return String(result.rows[0]?.version || process.env.STAR_CITIZEN_LIVE_VERSION || "4.8.3");
}

async function loadCapabilityOverrides(client, profile) {
  const subjects = [{ type: "rank", key: profile.rank }, ...(profile.roles || []).map((key) => ({ type: "appointment", key }))];
  const roleResult = subjects.length
    ? await client.query(
      `select subject_type,subject_key,capability,enabled from public.role_capability_overrides
       where ${subjects.map((_, index) => `(subject_type=$${index * 2 + 1} and subject_key=$${index * 2 + 2})`).join(" or ")}`,
      subjects.flatMap((subject) => [subject.type, subject.key])
    )
    : { rows: [] };
  const merged = {};
  // Apply rank first, then concurrent appointments in the member's stable role order.
  // Member-specific exceptions are applied last below.
  for (const subject of subjects) {
    for (const row of roleResult.rows.filter((item) => item.subject_type === subject.type && item.subject_key === subject.key)) {
      merged[row.capability] = row.enabled;
    }
  }
  const memberResult = await client.query(
    "select capability,enabled from public.member_capability_overrides where profile_id=$1::uuid and (expires_at is null or expires_at>now())",
    [profile.id]
  );
  for (const row of memberResult.rows) merged[row.capability] = row.enabled;
  return merged;
}

async function enrichProfile(client, row) {
  const roleRows = await client.query(
    "select role,expires_at,scope,notes from public.member_roles where profile_id=$1::uuid and active=true and (expires_at is null or expires_at>now()) order by role",
    [row.id]
  );
  const deptRows = await client.query(
    `select d.id,d.name,md.department_role from public.member_departments md
     join public.departments d on d.id=md.department_id where md.profile_id=$1::uuid and d.enabled=true order by d.sort_order,d.name`,
    [row.id]
  );
  const profile = {
    ...row,
    roles: roleRows.rows.map((item) => item.role),
    role_details: roleRows.rows,
    departments: deptRows.rows
  };
  profile.capability_overrides = await loadCapabilityOverrides(client, profile);
  profile.capabilities = capabilities(profile);
  return profile;
}

export async function requireMember() {
  const user = await getUser();
  if (!user?.id) throw httpError(401, "Please log in to the Free Navy portal.");
  const client = dbPool();
  const idRoles = identityRoles(user);
  const identityRank = idRoles.find((role) => RANKS.includes(role));
  const identityAppointments = idRoles.filter((role) => APPOINTMENTS.includes(role));
  const name = String(user.name || user.userMetadata?.full_name || user.email?.split("@")[0] || "Member").slice(0, 120);
  const email = user.email || null;
  const bootstrapEmail = String(process.env.BOOTSTRAP_OWNER_EMAIL || "").trim().toLowerCase();
  const isBootstrapOwner = Boolean(email && bootstrapEmail && String(email).toLowerCase() === bootstrapEmail);
  let result = await client.query("select * from public.profiles where id=$1::uuid", [user.id]);
  if (!result.rows[0]) {
    const rank = isBootstrapOwner ? "president" : (identityRank || "enlisted");
    result = await client.query(
      "insert into public.profiles(id,email,display_name,role,rank,status,membership_stage,last_login_at) values($1::uuid,$2,$3,$4,$5,'active','full',now()) returning *",
      [user.id, email, name, rank === "president" ? "owner" : "member", rank]
    );
    for (const role of identityAppointments) {
      await client.query("insert into public.member_roles(profile_id,role) values($1::uuid,$2) on conflict(profile_id,role) do update set active=true", [user.id, role]);
    }
  } else {
    const current = result.rows[0];
    const nextRank = isBootstrapOwner ? "president" : (current.rank || identityRank || "enlisted");
    result = await client.query(
      "update public.profiles set email=$2, display_name=coalesce(nullif(display_name,''),$3), rank=$4,last_login_at=now() where id=$1::uuid returning *",
      [user.id, email, name, nextRank]
    );
  }
  let profile = result.rows[0];
  if (profile.status === "invited") {
    const activated = await client.query("update public.profiles set status='active' where id=$1::uuid returning *", [user.id]);
    profile = activated.rows[0];
  }
  const tokenSessionVersion = Number(user?.appMetadata?.session_version ?? user?.app_metadata?.session_version ?? 1);
  if (Number(profile.session_version || 1) > tokenSessionVersion) throw httpError(401, "Your sessions were revoked. Log out and sign in again.");
  if (profile.status !== "active") throw httpError(403, "This Free Navy membership is not active.");
  profile = await enrichProfile(client, profile);
  return { user, profile, client };
}

export function assertRead(profile, table) {
  if (!TABLES.has(table)) throw httpError(400, "Unsupported data table.");
  if (table === "membership_applications" && !canApproveApplications(profile)) throw httpError(403, "Application review permission required.");
  if (ADMIN_READ.has(table) && !canManageSite(profile) && !( ["data_import_runs","sync_sources","live_patch_records"].includes(table) && canManageImports(profile))) {
    throw httpError(403, "This data is restricted.");
  }
  if (isProbationary(profile) && ["intel_reports","donations","points_ledger","auctions","auction_bids","approval_requests"].includes(table)) {
    throw httpError(403, "This area becomes available after probation is completed.");
  }
  if (table === "role_capability_overrides" || table === "member_capability_overrides") {
    if (!canManagePermissions(profile)) throw httpError(403, "Permission management is restricted to the President and Vice President.");
  }
  if (table === "backup_records" && !canManageBackups(profile)) throw httpError(403, "Backup access requires site administration permission.");
}

export function prepareCreate(profile, table, input) {
  if (!TABLES.has(table) || RPC_ONLY.has(table)) throw httpError(400, "This table cannot be changed directly.");
  const payload = { ...(input || {}) };
  if (!canManage(profile, table)) {
    if (!MEMBER_CREATE.has(table)) throw httpError(403, "You do not have permission to add this record.");
    const ownerField = OWNER_FIELDS[table];
    if (ownerField) payload[ownerField] = profile.id;
    if (["knowledge_locations","mining_locations","salvage_locations","exploration_routes","intel_reports"].includes(table)) {
      payload.status = "pending";
      if ("confidence" in payload || ["knowledge_locations","mining_locations","salvage_locations"].includes(table)) payload.confidence = "pending";
    }
    if (table === "data_flags") payload.status = "open";
    if (table === "equipment_loans") payload.status = "requested";
  }
  delete payload.id; delete payload.created_at; delete payload.updated_at;
  return payload;
}

export function assertUpdate(profile, table, existing, payload) {
  if (!existing) throw httpError(404, "Record not found.");
  if (table === "profiles") {
    if (String(existing.id) === String(profile.id)) {
      const allowed = ["display_name","rsi_handle","discord_handle","time_zone","preferred_activities","availability_notes","primary_division"];
      if (Object.keys(payload).every((key) => allowed.includes(key))) return;
    }
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    return;
  }
  if (table === "data_flags") {
    if (canEditGameData(profile)) return;
    if (String(existing.reported_by) === String(profile.id) && existing.status === "open") return;
    throw httpError(403, "You cannot change this accuracy report.");
  }
  if (canManage(profile, table)) return;
  const ownerField = OWNER_FIELDS[table];
  if (!MEMBER_EDIT_OWN.has(table) || !ownerField || String(existing[ownerField]) !== String(profile.id)) {
    throw httpError(403, "You can only edit your own permitted records.");
  }
}

export function assertDelete(profile, table) {
  if (!canManage(profile, table)) throw httpError(403, "You do not have permission to delete this record.");
}

export async function audit(client, profile, action, table, entity, details = {}) {
  const label = entity?.title || entity?.name || entity?.item_name || entity?.material_name || entity?.ship_name || entity?.display_name || entity?.id || "record";
  await client.query(
    "insert into public.audit_log(actor_id,action,entity_type,entity_name) values($1::uuid,$2,$3,$4)",
    [profile?.id || null, action, table, String(label).slice(0, 300)]
  );
  if (details.previous || details.next || details.reason) {
    await client.query(
      `insert into public.record_history(entity_type,entity_id,action,previous_values,new_values,reason,source_name,actor_id,game_version)
       values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8::uuid,$9)`,
      [table, String(entity?.id || details.entityId || ""), action, JSON.stringify(details.previous || {}), JSON.stringify(details.next || entity || {}), details.reason || "", details.sourceName || "Free Navy portal", profile?.id || null, details.gameVersion || ""]
    );
  }
}

export async function transaction(fn) {
  const client = await dbPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}
