import crypto from "node:crypto";
import { admin, requestPasswordRecovery } from "@netlify/identity";
import {
  TABLES, GAME_VERSION_TABLES, OWNER_FIELDS, RANKS, APPOINTMENTS, dbPool, json, errorResponse, httpError,
  assertSameOrigin, ident, requireMember, assertRead, prepareCreate, assertUpdate, assertDelete, canManage,
  isAdmin, isOfficerUp, isExecutive, isPresident, isProbationary, canManageMembers, canManageTreasury, canManageWarehouse,
  canEditGameData, canApproveApplications, canAssignRanks, canAssignAppointments, canManagePermissions,
  canManageBackups, canRestoreBackups, currentLiveVersion, audit, transaction, CAPABILITY_KEYS, PROTECTED_CAPABILITIES
} from "../lib/netlify.mjs";

function cleanPayload(payload = {}) {
  const output = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(key)) continue;
    if (["id","created_at","updated_at"].includes(key)) continue;
    output[key] = value === "" ? null : value;
  }
  return output;
}

async function attachMemberRoles(client, rows) {
  if (!rows.length) return rows;
  const result = await client.query(
    "select profile_id,role,expires_at,scope,notes from public.member_roles where profile_id=any($1::uuid[]) and active=true and (expires_at is null or expires_at>now())",
    [rows.map((row) => row.id)]
  );
  const map = new Map();
  for (const role of result.rows) {
    const list = map.get(String(role.profile_id)) || [];
    list.push({ role: role.role, expires_at: role.expires_at, scope: role.scope, notes: role.notes });
    map.set(String(role.profile_id), list);
  }
  const departments = await client.query(
    `select md.profile_id,d.id,d.name,md.department_role from public.member_departments md
     join public.departments d on d.id=md.department_id where md.profile_id=any($1::uuid[]) and d.enabled=true order by d.sort_order,d.name`,
    [rows.map((row) => row.id)]
  );
  const deptMap = new Map();
  for (const item of departments.rows) {
    const list = deptMap.get(String(item.profile_id)) || [];
    list.push({ id: item.id, name: item.name, department_role: item.department_role });
    deptMap.set(String(item.profile_id), list);
  }
  return rows.map((row) => {
    const roleDetails = map.get(String(row.id)) || [];
    return { ...row, roles: roleDetails.map((item) => item.role), role_details: roleDetails, departments: deptMap.get(String(row.id)) || [] };
  });
}

async function listRows(client, profile, table, options = {}) {
  assertRead(profile, table);
  const clauses = [];
  const values = [];
  const filters = Array.isArray(options.filters) ? options.filters : [];
  for (const filter of filters.slice(0, 12)) {
    const [column, operator, value] = filter;
    const col = ident(column);
    if (operator === "eq") { values.push(value); clauses.push(`${col} = $${values.length}`); }
    else if (operator === "neq") { values.push(value); clauses.push(`${col} <> $${values.length}`); }
    else if (operator === "is" && value === null) clauses.push(`${col} is null`);
    else if (operator === "is") { values.push(value); clauses.push(`${col} is not distinct from $${values.length}`); }
  }
  if (table === "notifications" && !isAdmin(profile)) { values.push(profile.id); clauses.push(`member_id = $${values.length}::uuid`); }
  if (table === "watchlists" && !isAdmin(profile)) { values.push(profile.id); clauses.push(`member_id = $${values.length}::uuid`); }
  if (table === "equipment_loans" && !canManageWarehouse(profile)) { values.push(profile.id); clauses.push(`member_id = $${values.length}::uuid`); }
  if (table === "intel_reports" && !isOfficerUp(profile)) clauses.push(`coalesce(classification,'members') <> 'officers'`);
  if (table === "exploration_routes" && !isOfficerUp(profile)) clauses.push(`coalesce(visibility,'members') <> 'officers'`);
  if (table === "data_flags" && !canEditGameData(profile)) { values.push(profile.id); clauses.push(`(reported_by = $${values.length}::uuid or status='open')`); }
  if (table === "knowledge_articles" && !canManage(profile, table)) {
    clauses.push(`status = 'published'`);
    if (!isOfficerUp(profile)) clauses.push(`audience = 'members'`);
  }
  if (table === "approval_requests" && !profile.capabilities?.manage_approvals) throw httpError(403, "Approval management permission required.");
  if (GAME_VERSION_TABLES.has(table) && !options.includeAllVersions) {
    const live = await currentLiveVersion(client);
    values.push(live); clauses.push(`game_version = $${values.length}`);
    if (["game_catalog","catalog_locations","data_source_records"].includes(table)) clauses.push(`environment = 'LIVE'`);
  }
  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
  const order = options.order ? ident(options.order) : null;
  const direction = options.ascending ? "asc" : "desc";
  const orderSql = order ? ` order by ${order} ${direction}` : "";
  const limit = Math.min(Math.max(Number(options.limit || 1000), 1), 5000);
  const result = await client.query(`select * from public.${ident(table)}${where}${orderSql} limit ${limit}`, values);
  if (table === "profiles") {
    let rows = await attachMemberRoles(client, result.rows);
    if (!canManageMembers(profile)) rows = rows.map(({ email, ...row }) => row);
    return rows;
  }
  return result.rows;
}

async function createRow(client, profile, table, input) {
  let payload = prepareCreate(profile, table, cleanPayload(input));
  if (table === "feature_flags" && String(payload.feature_key || "").startsWith("discord_")) {
    throw httpError(409, "Use Admin → Discord Integrations so Netlify environment validation can run.");
  }
  if (table === "site_settings" && String(payload.setting_key || "") === "discord_integration") {
    throw httpError(409, "Use Admin → Discord Integrations to change Discord settings.");
  }
  if (GAME_VERSION_TABLES.has(table)) payload.game_version = await currentLiveVersion(client);
  if (["game_catalog","catalog_locations","data_source_records"].includes(table)) payload.environment = "LIVE";
  const columns = Object.keys(payload);
  if (!columns.length) throw httpError(400, "No record data was supplied.");
  const values = Object.values(payload);
  const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
  const result = await client.query(
    `insert into public.${ident(table)} (${columns.map(ident).join(",")}) values (${placeholders}) returning *`, values
  );
  await audit(client, profile, "create", table, result.rows[0], { next: result.rows[0], gameVersion: result.rows[0]?.game_version || "" });
  if (["knowledge_locations","mining_locations","salvage_locations","exploration_routes"].includes(table) && result.rows[0]?.status === "pending") {
    await client.query(
      `insert into public.notifications(member_id,title,message,category)
       select distinct p.id,$1,$2,'submission' from public.profiles p
       left join public.member_roles mr on mr.profile_id=p.id and mr.role='admin' and mr.active=true and (mr.expires_at is null or mr.expires_at>now())
       where p.status='active' and (p.rank in ('president','vice_president','general','admiral','vice_admiral','rear_admiral','brigadier_general','officer') or mr.id is not null)`,
      ["New location submission", `${profile.display_name || "A member"} submitted ${result.rows[0]?.name || result.rows[0]?.item_name || result.rows[0]?.material_name || "a location"} for officer review.`]
    );
  }
  if (table === "data_flags") {
    await client.query(
      `insert into public.notifications(member_id,title,message,category)
       select distinct p.id,$1,$2,'accuracy' from public.profiles p
       left join public.member_roles mr on mr.profile_id=p.id and mr.role='admin' and mr.active=true and (mr.expires_at is null or mr.expires_at>now())
       where p.status='active' and (p.rank in ('president','vice_president','general','admiral','vice_admiral','rear_admiral','brigadier_general','officer') or mr.id is not null)`,
      ["Accuracy flag submitted", `${profile.display_name || "A member"} flagged ${result.rows[0]?.target_name || "a record"}: ${result.rows[0]?.reason || "accuracy concern"}.`]
    );
  }
  return result.rows[0];
}

async function updateRow(client, profile, table, id, input) {
  if (!TABLES.has(table) || table === "audit_log") throw httpError(400, "Unsupported data table.");
  const existingResult = await client.query(`select * from public.${ident(table)} where id=$1::uuid limit 1`, [id]);
  const existing = existingResult.rows[0];
  const payload = cleanPayload(input);
  delete payload.change_reason;
  assertUpdate(profile, table, existing, payload);
  if (!canManage(profile, table)) {
    const ownerField = OWNER_FIELDS[table];
    if (ownerField) delete payload[ownerField];
  }
  if (GAME_VERSION_TABLES.has(table)) payload.game_version = await currentLiveVersion(client);
  if (["game_catalog","catalog_locations","data_source_records"].includes(table)) payload.environment = "LIVE";
  if (table === "profiles") {
    const self = String(id) === String(profile.id);
    const allowed = self
      ? ["display_name","rsi_handle","discord_handle","time_zone","preferred_activities","availability_notes","primary_division"]
      : ["display_name","rsi_handle","discord_handle","status","primary_division","time_zone","preferred_activities","availability_notes"];
    for (const key of Object.keys(payload)) if (!allowed.includes(key)) delete payload[key];
  }
  if (table === "feature_flags" && String(existing?.feature_key || "").startsWith("discord_")) {
    throw httpError(409, "Use Admin → Discord Integrations so Netlify environment validation can run.");
  }
  if (table === "site_settings" && String(existing?.setting_key || "") === "discord_integration") {
    throw httpError(409, "Use Admin → Discord Integrations to change Discord settings.");
  }
  if (["game_catalog","catalog_locations"].includes(table) && canEditGameData(profile)) {
    const lockable = table === "game_catalog"
      ? ["name","category","subcategory","manufacturer","description","status","confidence"]
      : ["entity_name","category","system_name","body_name","location_name","terminal_name","purchase_price_auec","rental_price_auec","status","confidence"];
    const overrides = { ...(existing.officer_overrides || {}) };
    for (const key of lockable) if (Object.prototype.hasOwnProperty.call(payload, key)) overrides[key] = payload[key];
    overrides.updated_by = profile.id;
    overrides.updated_at = new Date().toISOString();
    overrides.reason = String(input?.change_reason || overrides.reason || "Officer correction").slice(0, 1000);
    payload.officer_overrides = overrides;
    payload.officer_locked = true;
  }
  if (table === "data_flags" && canEditGameData(profile)) {
    if (["resolved","rejected"].includes(payload.status)) payload.resolved_by = profile.id;
  }
  const columns = Object.keys(payload);
  if (!columns.length) return existing;
  const values = Object.values(payload);
  values.push(id);
  const assignments = columns.map((column, index) => `${ident(column)}=$${index + 1}`).join(",");
  const result = await client.query(`update public.${ident(table)} set ${assignments} where id=$${values.length}::uuid returning *`, values);
  await audit(client, profile, "update", table, result.rows[0], { previous: existing, next: result.rows[0], reason: input?.change_reason || "", gameVersion: result.rows[0]?.game_version || "" });
  return result.rows[0];
}

async function deleteRow(client, profile, table, id) {
  if (!TABLES.has(table) || ["profiles","audit_log","member_roles","membership_applications"].includes(table)) throw httpError(400, "This record cannot be deleted here.");
  assertDelete(profile, table);
  const result = await client.query(`delete from public.${ident(table)} where id=$1::uuid returning *`, [id]);
  if (!result.rows[0]) throw httpError(404, "Record not found.");
  await audit(client, profile, "delete", table, result.rows[0], { previous: result.rows[0], next: {}, gameVersion: result.rows[0]?.game_version || "" });
  return true;
}

async function identityRoleSync(client, memberId) {
  const member = await client.query("select id,rank from public.profiles where id=$1::uuid", [memberId]);
  if (!member.rows[0]) return;
  const roles = await client.query("select role from public.member_roles where profile_id=$1::uuid and active=true and (expires_at is null or expires_at>now()) order by role", [memberId]);
  const identityRoles = [member.rows[0].rank, ...roles.rows.map((row) => row.role)];
  const session = await client.query("select session_version from public.profiles where id=$1::uuid", [memberId]);
  try {
    await admin.updateUser(memberId, { role: member.rows[0].rank, app_metadata: { roles: identityRoles, session_version: Number(session.rows[0]?.session_version || 1) } });
  } catch (error) {
    console.warn("Identity role sync failed; database permissions remain authoritative.", error?.message || error);
  }
}

async function rpc(profile, name, params = {}) {
  if (name === "award_member_points") {
    if (!canManageTreasury(profile)) throw httpError(403, "Treasury permission required.");
    const amount = Number(params.point_amount || 0);
    if (!Number.isSafeInteger(amount) || amount === 0) throw httpError(400, "Enter a non-zero whole point amount.");
    const thresholdResult = await dbPool().query("select coalesce((setting_value->>'points')::int,5000) as threshold from public.site_settings where setting_key='high_value_points_threshold'");
    const threshold = Number(thresholdResult.rows[0]?.threshold || 5000);
    if (Math.abs(amount) >= threshold && !params.second_approval) {
      const request = await dbPool().query(
        `insert into public.approval_requests(request_type,entity_type,entity_id,title,payload,requested_by,required_capability,expires_at)
         values('points_adjustment','profiles',$1,$2,$3::jsonb,$4::uuid,'manage_treasury',now()+interval '7 days') returning *`,
        [params.target_member, `Points adjustment of ${amount}`, JSON.stringify({ ...params, point_amount: amount }), profile.id]
      );
      await audit(dbPool(), profile, "approval.request", "approval_requests", request.rows[0]);
      return { pending_approval: true, approval_id: request.rows[0].id, threshold };
    }
    return transaction(async (client) => {
      const member = await client.query("select * from public.profiles where id=$1::uuid for update", [params.target_member]);
      if (!member.rows[0]) throw httpError(404, "Member not found.");
      const updated = await client.query("update public.profiles set points_balance=points_balance+$2 where id=$1::uuid returning *", [params.target_member, amount]);
      await client.query("insert into public.points_ledger(member_id,amount,reason,linked_record,created_by) values($1::uuid,$2,$3,$4,$5::uuid)", [params.target_member, amount, params.point_reason || "Treasury adjustment", params.linked_record || "", profile.id]);
      await audit(client, profile, "points.award", "profiles", updated.rows[0], { previous: member.rows[0], next: updated.rows[0], reason: params.point_reason || "Treasury adjustment" });
      return updated.rows[0].points_balance;
    });
  }

  if (name === "set_member_rank") {
    if (!canAssignRanks(profile)) throw httpError(403, "Only the President or Vice President can change ranks.");
    const rank = String(params.rank || "").toLowerCase();
    if (!RANKS.includes(rank)) throw httpError(400, "Invalid organisation rank.");
    if (rank === "president" && !isPresident(profile)) throw httpError(403, "Only the President can appoint another President.");
    const target = await dbPool().query("select * from public.profiles where id=$1::uuid", [params.target_member]);
    if (!target.rows[0]) throw httpError(404, "Member not found.");
    if (target.rows[0].rank === "president" && !isPresident(profile)) throw httpError(403, "The Vice President cannot alter the President.");
    const result = await dbPool().query("update public.profiles set rank=$2 where id=$1::uuid returning *", [params.target_member, rank]);
    await identityRoleSync(dbPool(), params.target_member);
    await audit(dbPool(), profile, "member.rank", "profiles", result.rows[0]);
    return result.rows[0];
  }

  if (name === "set_member_appointment") {
    if (!canAssignAppointments(profile)) throw httpError(403, "Only the President or Vice President can assign appointments.");
    const role = String(params.role || "").toLowerCase();
    if (!APPOINTMENTS.includes(role)) throw httpError(400, "Invalid additional role.");
    const enabled = Boolean(params.enabled);
    const expiresAt = params.expires_at ? new Date(params.expires_at) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw httpError(400, "Invalid appointment expiry date.");
    const scope = String(params.scope || "organisation").slice(0, 120);
    const notes = String(params.notes || "").slice(0, 1000);
    const member = await dbPool().query("select * from public.profiles where id=$1::uuid", [params.target_member]);
    if (!member.rows[0]) throw httpError(404, "Member not found.");
    if (enabled) {
      await dbPool().query(
        `insert into public.member_roles(profile_id,role,assigned_by,expires_at,scope,notes,active)
         values($1::uuid,$2,$3::uuid,$4,$5,$6,true)
         on conflict(profile_id,role) do update set assigned_by=excluded.assigned_by,assigned_at=now(),expires_at=excluded.expires_at,scope=excluded.scope,notes=excluded.notes,active=true`,
        [params.target_member, role, profile.id, expiresAt?.toISOString() || null, scope, notes]
      );
    } else {
      await dbPool().query("update public.member_roles set active=false where profile_id=$1::uuid and role=$2", [params.target_member, role]);
    }
    await identityRoleSync(dbPool(), params.target_member);
    await audit(dbPool(), profile, enabled ? "member.role.add" : "member.role.remove", "profiles", member.rows[0], { reason: notes });
    return true;
  }

  if (name === "set_member_status") {
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    const status = String(params.status || "");
    if (!["active","inactive","banned"].includes(status)) throw httpError(400, "Invalid membership status.");
    const target = await dbPool().query("select * from public.profiles where id=$1::uuid", [params.target_member]);
    if (!target.rows[0]) throw httpError(404, "Member not found.");
    if (target.rows[0].rank === "president" && !isPresident(profile)) throw httpError(403, "Only the President can change another President's access.");
    const result = await dbPool().query("update public.profiles set status=$2,session_version=case when $2 in ('inactive','banned') then session_version+1 else session_version end,updated_at=now() where id=$1::uuid returning *", [params.target_member, status]);
    await audit(dbPool(), profile, `member.${status}`, "profiles", result.rows[0]);
    return true;
  }

  if (name === "remove_member") {
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    const target = await dbPool().query("select * from public.profiles where id=$1::uuid", [params.target_member]);
    if (!target.rows[0]) throw httpError(404, "Member not found.");
    if (target.rows[0].rank === "president" && !isPresident(profile)) throw httpError(403, "Only the President can remove another President.");
    await dbPool().query("update public.profiles set status='inactive',membership_stage='former',departed_at=now(),session_version=session_version+1,updated_at=now() where id=$1::uuid", [params.target_member]);
    try { await admin.deleteUser(params.target_member); } catch (error) { console.warn("Identity deletion failed", error?.message || error); }
    await audit(dbPool(), profile, "member.remove", "profiles", target.rows[0]);
    return true;
  }

  if (name === "review_membership_application") {
    if (!canApproveApplications(profile)) throw httpError(403, "Officer approval permission required.");
    const decision = String(params.decision || "");
    if (!["approved","refused","more_info"].includes(decision)) throw httpError(400, "Invalid application decision.");
    return transaction(async (client) => {
      const applicationResult = await client.query("select * from public.membership_applications where id=$1::uuid for update", [params.application_id]);
      const application = applicationResult.rows[0];
      if (!application || application.status !== "pending") throw httpError(409, "This application is no longer pending.");
      if (decision === "refused") {
        const updated = await client.query("update public.membership_applications set status='refused',reviewed_by=$2::uuid,reviewed_at=now(),review_notes=$3 where id=$1::uuid returning *", [application.id, profile.id, params.notes || ""]);
        await audit(client, profile, "application.refuse", "membership_applications", { name: application.display_name }, { reason: params.notes || "" });
        return updated.rows[0];
      }
      if (decision === "more_info") {
        const updated = await client.query("update public.membership_applications set review_notes=$2,updated_at=now() where id=$1::uuid returning *", [application.id, params.notes || "Further information requested."]);
        await audit(client, profile, "application.more-info", "membership_applications", { name: application.display_name }, { reason: params.notes || "" });
        return updated.rows[0];
      }
      const temporaryPassword = crypto.randomBytes(32).toString("base64url");
      let user;
      try {
        user = await admin.createUser({
          email: application.email,
          password: temporaryPassword,
          data: {
            role: "enlisted",
            app_metadata: { roles: ["enlisted"], session_version: 1 },
            user_metadata: { full_name: application.display_name }
          }
        });
      } catch (error) {
        throw httpError(409, error?.message || "An Identity account already exists for this email.");
      }
      const defaultProbation = await client.query("select coalesce((setting_value->>'days')::int,14) as days from public.site_settings where setting_key='default_probation_days'");
      const probationDays = Math.max(0, Math.min(365, Number(params.probation_days ?? application.probation_days ?? defaultProbation.rows[0]?.days ?? 14)));
      await client.query(
        `insert into public.profiles(id,email,display_name,rsi_handle,discord_handle,role,rank,status,points_balance,membership_stage,probation_ends_at)
         values($1::uuid,$2,$3,$4,$5,'member','enlisted','invited',0,$6,case when $7>0 then now()+($7||' days')::interval else null end)
         on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,rsi_handle=excluded.rsi_handle,
           discord_handle=excluded.discord_handle,rank='enlisted',status='invited',membership_stage=excluded.membership_stage,
           probation_ends_at=excluded.probation_ends_at`,
        [user.id, application.email, application.display_name, application.rsi_handle || "", application.discord_handle || "", probationDays > 0 ? "probationary" : "full", probationDays]
      );
      const updated = await client.query("update public.membership_applications set status='approved',reviewed_by=$2::uuid,reviewed_at=now(),review_notes=$3,identity_user_id=$4::uuid where id=$1::uuid returning *", [application.id, profile.id, params.notes || "", user.id]);
      await requestPasswordRecovery(application.email);
      await audit(client, profile, "application.approve", "membership_applications", { name: application.display_name }, { reason: params.notes || "" });
      return updated.rows[0];
    });
  }

  if (name === "set_membership_stage") {
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    const stage = String(params.stage || "");
    if (!["probationary","full","former"].includes(stage)) throw httpError(400, "Invalid membership stage.");
    const days = Math.max(0, Math.min(365, Number(params.probation_days || 14)));
    const target = await dbPool().query("select * from public.profiles where id=$1::uuid", [params.target_member]);
    if (!target.rows[0]) throw httpError(404, "Member not found.");
    if (target.rows[0].rank === "president" && !isPresident(profile)) throw httpError(403, "Only the President can change another President's membership stage.");
    const result = await dbPool().query(
      `update public.profiles set membership_stage=$2,
       probation_ends_at=case when $2='probationary' then now()+($3||' days')::interval else null end,
       departed_at=case when $2='former' then now() else departed_at end,
       probation_notes=$4 where id=$1::uuid returning *`,
      [params.target_member, stage, days, String(params.notes || "").slice(0,1000)]
    );
    await audit(dbPool(), profile, `member.stage.${stage}`, "profiles", result.rows[0], { previous: target.rows[0], next: result.rows[0], reason: params.notes || "" });
    return result.rows[0];
  }

  if (name === "set_member_department") {
    if (!profile.capabilities?.manage_departments) throw httpError(403, "Department management permission required.");
    const department = await dbPool().query("select * from public.departments where id=$1::uuid", [params.department_id]);
    if (!department.rows[0]) throw httpError(404, "Department not found.");
    const enabled = Boolean(params.enabled);
    const departmentRole = String(params.department_role || "member");
    if (!["lead","deputy","officer","member"].includes(departmentRole)) throw httpError(400, "Invalid department role.");
    if (enabled) {
      await dbPool().query(
        `insert into public.member_departments(profile_id,department_id,department_role,assigned_by)
         values($1::uuid,$2::uuid,$3,$4::uuid)
         on conflict(profile_id,department_id) do update set department_role=excluded.department_role,assigned_by=excluded.assigned_by,assigned_at=now()`,
        [params.target_member, params.department_id, departmentRole, profile.id]
      );
    } else {
      await dbPool().query("delete from public.member_departments where profile_id=$1::uuid and department_id=$2::uuid", [params.target_member, params.department_id]);
    }
    await audit(dbPool(), profile, enabled ? "department.assign" : "department.remove", "departments", department.rows[0]);
    return true;
  }

  if (name === "set_capability_override") {
    if (!canManagePermissions(profile)) throw httpError(403, "Only the President and Vice President can change the permission matrix.");
    const subjectType = String(params.subject_type || "");
    const subjectKey = String(params.subject_key || "");
    const capability = String(params.capability || "");
    if (!["rank","appointment"].includes(subjectType)) throw httpError(400, "Invalid permission subject type.");
    if (subjectType === "rank" && !RANKS.includes(subjectKey)) throw httpError(400, "Invalid rank.");
    if (subjectType === "appointment" && !APPOINTMENTS.includes(subjectKey)) throw httpError(400, "Invalid appointment.");
    if (!CAPABILITY_KEYS.includes(capability)) throw httpError(400, "Unknown capability.");
    if (PROTECTED_CAPABILITIES.has(capability)) throw httpError(403, "This protected permission is controlled by command rank and cannot be overridden.");
    if (params.remove) {
      await dbPool().query("delete from public.role_capability_overrides where subject_type=$1 and subject_key=$2 and capability=$3", [subjectType, subjectKey, capability]);
    } else {
      await dbPool().query(
        `insert into public.role_capability_overrides(subject_type,subject_key,capability,enabled,updated_by)
         values($1,$2,$3,$4,$5::uuid)
         on conflict(subject_type,subject_key,capability) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now()`,
        [subjectType, subjectKey, capability, Boolean(params.enabled), profile.id]
      );
    }
    await audit(dbPool(), profile, "permissions.override", "role_capability_overrides", { name: `${subjectType}:${subjectKey}:${capability}` });
    return true;
  }

  if (name === "set_member_capability_override") {
    if (!canManagePermissions(profile)) throw httpError(403, "Only the President and Vice President can set member permission exceptions.");
    const capability = String(params.capability || "");
    if (!CAPABILITY_KEYS.includes(capability) || PROTECTED_CAPABILITIES.has(capability)) throw httpError(400, "Invalid or protected capability.");
    if (params.remove) {
      await dbPool().query("delete from public.member_capability_overrides where profile_id=$1::uuid and capability=$2", [params.target_member, capability]);
    } else {
      await dbPool().query(
        `insert into public.member_capability_overrides(profile_id,capability,enabled,reason,expires_at,updated_by)
         values($1::uuid,$2,$3,$4,$5,$6::uuid)
         on conflict(profile_id,capability) do update set enabled=excluded.enabled,reason=excluded.reason,expires_at=excluded.expires_at,updated_by=excluded.updated_by,updated_at=now()`,
        [params.target_member, capability, Boolean(params.enabled), String(params.reason || "").slice(0,1000), params.expires_at || null, profile.id]
      );
    }
    await audit(dbPool(), profile, "permissions.member-override", "profiles", { id: params.target_member, name: params.target_member });
    return true;
  }

  if (name === "send_member_password_reset") {
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    const target = await dbPool().query("select * from public.profiles where id=$1::uuid", [params.target_member]);
    if (!target.rows[0]?.email) throw httpError(404, "Member email not found.");
    await requestPasswordRecovery(target.rows[0].email);
    await audit(dbPool(), profile, "member.password-reset", "profiles", target.rows[0]);
    return true;
  }

  if (name === "revoke_member_sessions") {
    if (!canManageMembers(profile)) throw httpError(403, "Member management permission required.");
    const target = await dbPool().query("update public.profiles set session_version=session_version+1 where id=$1::uuid returning *", [params.target_member]);
    if (!target.rows[0]) throw httpError(404, "Member not found.");
    await identityRoleSync(dbPool(), params.target_member);
    await audit(dbPool(), profile, "member.sessions-revoked", "profiles", target.rows[0]);
    return true;
  }

  if (name === "toggle_watchlist") {
    const entityType = String(params.entity_type || "").slice(0,80);
    const entityId = String(params.entity_id || "").slice(0,160);
    const entityName = String(params.entity_name || entityId).slice(0,300);
    if (!entityType || !entityId) throw httpError(400, "A record is required.");
    const existing = await dbPool().query("select id from public.watchlists where member_id=$1::uuid and entity_type=$2 and entity_id=$3", [profile.id, entityType, entityId]);
    if (existing.rows[0]) {
      await dbPool().query("delete from public.watchlists where id=$1::uuid", [existing.rows[0].id]);
      return { watching: false };
    }
    await dbPool().query("insert into public.watchlists(member_id,entity_type,entity_id,entity_name,alert_types) values($1::uuid,$2,$3,$4,$5::text[])", [profile.id, entityType, entityId, entityName, Array.isArray(params.alert_types) ? params.alert_types : ["changed"]]);
    return { watching: true };
  }

  if (name === "claim_verification_task") {
    const result = await dbPool().query(
      "update public.verification_tasks set status='claimed',claimed_by=$2::uuid where id=$1::uuid and status='open' returning *",
      [params.task_id, profile.id]
    );
    if (!result.rows[0]) throw httpError(409, "This verification task is no longer open.");
    await audit(dbPool(), profile, "verification.claim", "verification_tasks", result.rows[0]);
    return result.rows[0];
  }

  if (name === "complete_verification_task") {
    const task = await dbPool().query("select * from public.verification_tasks where id=$1::uuid", [params.task_id]);
    if (!task.rows[0]) throw httpError(404, "Verification task not found.");
    const allowed = String(task.rows[0].claimed_by || "") === String(profile.id) || canEditGameData(profile);
    if (!allowed) throw httpError(403, "Only the claimant or an Officer can complete this task.");
    const result = await dbPool().query(
      "update public.verification_tasks set status='confirmed',confirmed_by=$2::uuid,evidence_url=$3,notes=$4 where id=$1::uuid returning *",
      [params.task_id, profile.id, String(params.evidence_url || "").slice(0,1000), String(params.notes || "").slice(0,2000)]
    );
    await audit(dbPool(), profile, "verification.confirm", "verification_tasks", result.rows[0]);
    return result.rows[0];
  }

  if (name === "create_verification_campaign") {
    if (!canEditGameData(profile)) throw httpError(403, "Officer access is required.");
    const live = await currentLiveVersion(dbPool());
    return transaction(async (client) => {
      const campaign = await client.query(
        `insert into public.verification_campaigns(game_version,title,status,created_by)
         values($1,$2,'active',$3::uuid)
         on conflict(game_version) do update set title=excluded.title,status='active',started_at=now(),completed_at=null returning *`,
        [live, params.title || `LIVE ${live} reconfirmation`, profile.id]
      );
      const tables = ["knowledge_locations","mining_locations","salvage_locations"];
      let count = 0;
      for (const table of tables) {
        const rows = await client.query(`select id,coalesce(item_name,material_name,location_name,'Record') as name from public.${table} where game_version=$1 and status not in ('rejected','removed')`, [live]);
        for (const row of rows.rows) {
          await client.query(
            `insert into public.verification_tasks(campaign_id,entity_type,entity_id,entity_name,category,reward_points)
             values($1::uuid,$2,$3,$4,$2,10) on conflict(campaign_id,entity_type,entity_id) do nothing`,
            [campaign.rows[0].id, table, String(row.id), row.name]
          );
          count += 1;
        }
      }
      await audit(client, profile, "verification.campaign", "verification_campaigns", campaign.rows[0]);
      return { campaign: campaign.rows[0], tasks_created: count };
    });
  }

  if (name === "manage_equipment_loan") {
    const loan = await dbPool().query("select * from public.equipment_loans where id=$1::uuid", [params.loan_id]);
    if (!loan.rows[0]) throw httpError(404, "Equipment loan not found.");
    const status = String(params.status || "");
    const selfReturn = ["returned","consumed","lost"].includes(status) && String(loan.rows[0].member_id) === String(profile.id);
    if (!canManageWarehouse(profile) && !selfReturn) throw httpError(403, "Quartermaster permission required.");
    if (!["approved","issued","returned","consumed","lost","rejected"].includes(status)) throw httpError(400, "Invalid loan status.");
    if (status === "approved" && !params.second_approval) {
      const valueResult = await dbPool().query(
        `select coalesce(w.estimated_unit_value_auec,0) * coalesce(l.quantity,0) as total_value
         from public.equipment_loans l left join public.warehouse_items w on w.id=l.warehouse_item_id where l.id=$1::uuid`,
        [params.loan_id]
      );
      const thresholdResult = await dbPool().query("select coalesce((setting_value->>'auec')::bigint,1000000) as threshold from public.site_settings where setting_key='high_value_warehouse_threshold'");
      const totalValue = Number(valueResult.rows[0]?.total_value || 0);
      const threshold = Number(thresholdResult.rows[0]?.threshold || 1000000);
      if (totalValue >= threshold) {
        const request = await dbPool().query(
          `insert into public.approval_requests(request_type,entity_type,entity_id,title,payload,requested_by,required_capability,expires_at)
           values('equipment_loan','equipment_loans',$1,$2,$3::jsonb,$4::uuid,'manage_warehouse',now()+interval '7 days') returning *`,
          [params.loan_id, `High-value equipment issue: ${loan.rows[0].item_name}`, JSON.stringify({ loan_id: params.loan_id, status: "approved", total_value: totalValue }), profile.id]
        );
        await audit(dbPool(), profile, "approval.request", "approval_requests", request.rows[0]);
        return { pending_approval: true, approval_id: request.rows[0].id, threshold, total_value: totalValue };
      }
    }
    const result = await dbPool().query(
      `update public.equipment_loans set status=$2,
       approved_by=case when $2='approved' then $3::uuid else approved_by end,
       issued_by=case when $2='issued' then $3::uuid else issued_by end,
       issued_at=case when $2='issued' then now() else issued_at end,
       returned_to=case when $2='returned' then $3::uuid else returned_to end,
       returned_at=case when $2 in ('returned','consumed','lost') then now() else returned_at end,
       condition_in=coalesce(nullif($4,''),condition_in),notes=coalesce(nullif($5,''),notes)
       where id=$1::uuid returning *`,
      [params.loan_id, status, profile.id, String(params.condition_in || ""), String(params.notes || "")]
    );
    await audit(dbPool(), profile, `loan.${status}`, "equipment_loans", result.rows[0]);
    return result.rows[0];
  }

  if (name === "post_operation_update") {
    if (!isOfficerUp(profile)) throw httpError(403, "Officer access is required to post command-room updates.");
    const result = await dbPool().query(
      "insert into public.operation_updates(operation_id,update_type,message,created_by) values($1::uuid,$2,$3,$4::uuid) returning *",
      [params.operation_id, params.update_type || "status", String(params.message || "").slice(0,2000), profile.id]
    );
    if (params.current_phase || params.emergency_status || params.objective_status) {
      await dbPool().query(
        `update public.operations set current_phase=coalesce(nullif($2,''),current_phase),emergency_status=coalesce(nullif($3,''),emergency_status),objective_status=coalesce(nullif($4,''),objective_status) where id=$1::uuid`,
        [params.operation_id, params.current_phase || "", params.emergency_status || "", params.objective_status || ""]
      );
    }
    await audit(dbPool(), profile, "operation.update", "operation_updates", result.rows[0]);
    return result.rows[0];
  }

  if (name === "record_operation_contribution") {
    if (!isOfficerUp(profile)) throw httpError(403, "Officer access is required to score contributions.");
    const result = await dbPool().query(
      `update public.operation_attendance set minutes_attended=$2,materials_contributed=$3,cargo_transported=$4,ship_supplied=$5,
       rescue_actions=$6,objectives_completed=$7,officer_commendation=$8,calculated_points=$9
       where operation_id=$1::uuid and member_id=$10::uuid returning *`,
      [params.operation_id, Number(params.minutes_attended||0), Number(params.materials_contributed||0), Number(params.cargo_transported||0), String(params.ship_supplied||""), Number(params.rescue_actions||0), Number(params.objectives_completed||0), String(params.officer_commendation||""), Number(params.calculated_points||0), params.member_id]
    );
    if (!result.rows[0]) throw httpError(404, "Attendance record not found.");
    await audit(dbPool(), profile, "operation.contribution", "operation_attendance", result.rows[0]);
    return result.rows[0];
  }

  if (name === "approve_operation_points") {
    if (!canManageTreasury(profile)) throw httpError(403, "Treasurer permission required to post operation points.");
    const attendanceCheck = await dbPool().query("select * from public.operation_attendance where id=$1::uuid", [params.attendance_id]);
    if (!attendanceCheck.rows[0]) throw httpError(404, "Attendance record not found.");
    if (attendanceCheck.rows[0].approved_points != null) throw httpError(409, "Points have already been approved.");
    const points = Number(params.points ?? attendanceCheck.rows[0].calculated_points ?? 0);
    const thresholdResult = await dbPool().query("select coalesce((setting_value->>'points')::int,5000) as threshold from public.site_settings where setting_key='high_value_points_threshold'");
    const threshold = Number(thresholdResult.rows[0]?.threshold || 5000);
    if (Math.abs(points) >= threshold && !params.second_approval) {
      const request = await dbPool().query(
        `insert into public.approval_requests(request_type,entity_type,entity_id,title,payload,requested_by,required_capability,expires_at)
         values('operation_points','operation_attendance',$1,$2,$3::jsonb,$4::uuid,'manage_treasury',now()+interval '7 days') returning *`,
        [params.attendance_id, `Operation points approval: ${points}`, JSON.stringify({ attendance_id: params.attendance_id, points }), profile.id]
      );
      await audit(dbPool(), profile, "approval.request", "approval_requests", request.rows[0]);
      return { pending_approval: true, approval_id: request.rows[0].id, threshold };
    }
    return transaction(async (client) => {
      const attendance = await client.query("select * from public.operation_attendance where id=$1::uuid for update", [params.attendance_id]);
      if (!attendance.rows[0]) throw httpError(404, "Attendance record not found.");
      if (attendance.rows[0].approved_points != null) throw httpError(409, "Points have already been approved.");
      await client.query("update public.operation_attendance set approved_points=$2,points_approved_by=$3::uuid where id=$1::uuid", [params.attendance_id, points, profile.id]);
      await client.query("update public.profiles set points_balance=points_balance+$2 where id=$1::uuid", [attendance.rows[0].member_id, points]);
      await client.query("insert into public.points_ledger(member_id,amount,reason,linked_record,created_by) values($1::uuid,$2,'Operation contribution',$3,$4::uuid)", [attendance.rows[0].member_id, points, `operation:${attendance.rows[0].operation_id}`, profile.id]);
      await audit(client, profile, "operation.points", "operation_attendance", attendance.rows[0]);
      return points;
    });
  }

  if (name === "save_knowledge_article") {
    if (!profile.capabilities?.manage_knowledge) throw httpError(403, "Knowledge-base editing permission required.");
    return transaction(async (client) => {
      const id = params.article_id || params.id || null;
      let article;
      let revision = 1;
      if (id) {
        const current = await client.query("select * from public.knowledge_articles where id=$1::uuid for update", [id]);
        if (!current.rows[0]) throw httpError(404, "Article not found.");
        revision = Number(current.rows[0].current_revision || 1) + 1;
        const updated = await client.query(
          `update public.knowledge_articles set slug=$2,title=$3,category=$4,summary=$5,body=$6,status=$7,audience=$8,current_revision=$9,updated_by=$10::uuid,
           approved_by=case when $7='published' then $10::uuid else approved_by end,approved_at=case when $7='published' then now() else approved_at end
           where id=$1::uuid returning *`,
          [id, params.slug, params.title, params.category || "General", params.summary || "", params.body || "", params.status || "draft", params.audience || "members", revision, profile.id]
        );
        article = updated.rows[0];
      } else {
        const created = await client.query(
          `insert into public.knowledge_articles(slug,title,category,summary,body,status,audience,current_revision,created_by,updated_by,approved_by,approved_at)
           values($1,$2,$3,$4,$5,$6,$7,1,$8::uuid,$8::uuid,case when $6='published' then $8::uuid else null end,case when $6='published' then now() else null end) returning *`,
          [params.slug, params.title, params.category || "General", params.summary || "", params.body || "", params.status || "draft", params.audience || "members", profile.id]
        );
        article = created.rows[0];
      }
      await client.query(
        `insert into public.knowledge_article_revisions(article_id,revision_number,title,summary,body,change_note,created_by)
         values($1::uuid,$2,$3,$4,$5,$6,$7::uuid)`,
        [article.id, revision, article.title, article.summary || "", article.body, params.change_note || "", profile.id]
      );
      await audit(client, profile, "knowledge.save", "knowledge_articles", article, { reason: params.change_note || "" });
      return article;
    });
  }

  if (name === "review_approval_request") {
    if (!profile.capabilities?.manage_approvals) throw httpError(403, "Approval permission required.");
    const decision = String(params.decision || "");
    if (!["approved","rejected"].includes(decision)) throw httpError(400, "Invalid decision.");
    return transaction(async (client) => {
      const request = await client.query("select * from public.approval_requests where id=$1::uuid for update", [params.request_id]);
      const row = request.rows[0];
      if (!row || row.status !== "pending") throw httpError(409, "This approval request is no longer pending.");
      if (String(row.requested_by) === String(profile.id)) throw httpError(403, "A second authorised person must approve this request.");
      const requiredCapability = String(row.required_capability || "manage_approvals");
      if (!profile.capabilities?.[requiredCapability]) {
        throw httpError(403, `This approval requires the ${requiredCapability} capability.`);
      }
      if (decision === "rejected") {
        const updated = await client.query("update public.approval_requests set status='rejected',approved_by=$2::uuid,reviewed_at=now(),review_notes=$3 where id=$1::uuid returning *", [row.id, profile.id, params.notes || ""]);
        await audit(client, profile, "approval.reject", "approval_requests", updated.rows[0]);
        return updated.rows[0];
      }
      if (row.request_type === "points_adjustment") {
        const payload = row.payload || {};
        const amount = Number(payload.point_amount || 0);
        const member = await client.query("select * from public.profiles where id=$1::uuid for update", [payload.target_member]);
        if (!member.rows[0]) throw httpError(404, "Target member not found.");
        await client.query("update public.profiles set points_balance=points_balance+$2 where id=$1::uuid", [payload.target_member, amount]);
        await client.query("insert into public.points_ledger(member_id,amount,reason,linked_record,created_by) values($1::uuid,$2,$3,$4,$5::uuid)", [payload.target_member, amount, payload.point_reason || "Approved treasury adjustment", payload.linked_record || `approval:${row.id}`, profile.id]);
      }
      if (row.request_type === "equipment_loan") {
        const payload = row.payload || {};
        const loan = await client.query("select * from public.equipment_loans where id=$1::uuid for update", [payload.loan_id || row.entity_id]);
        if (!loan.rows[0]) throw httpError(404, "Equipment loan not found.");
        await client.query("update public.equipment_loans set status='approved',approved_by=$2::uuid,updated_at=now() where id=$1::uuid", [loan.rows[0].id, profile.id]);
      }
      if (row.request_type === "operation_points") {
        const payload = row.payload || {};
        const attendance = await client.query("select * from public.operation_attendance where id=$1::uuid for update", [payload.attendance_id || row.entity_id]);
        if (!attendance.rows[0]) throw httpError(404, "Attendance record not found.");
        if (attendance.rows[0].approved_points != null) throw httpError(409, "Operation points were already posted.");
        const points = Number(payload.points ?? attendance.rows[0].calculated_points ?? 0);
        await client.query("update public.operation_attendance set approved_points=$2,points_approved_by=$3::uuid where id=$1::uuid", [attendance.rows[0].id, points, profile.id]);
        await client.query("update public.profiles set points_balance=points_balance+$2 where id=$1::uuid", [attendance.rows[0].member_id, points]);
        await client.query("insert into public.points_ledger(member_id,amount,reason,linked_record,created_by) values($1::uuid,$2,'Operation contribution',$3,$4::uuid)", [attendance.rows[0].member_id, points, `operation:${attendance.rows[0].operation_id}`, profile.id]);
      }
      const updated = await client.query("update public.approval_requests set status='executed',approved_by=$2::uuid,reviewed_at=now(),review_notes=$3 where id=$1::uuid returning *", [row.id, profile.id, params.notes || ""]);
      await audit(client, profile, "approval.execute", "approval_requests", updated.rows[0]);
      return updated.rows[0];
    });
  }

  if (name === "resolve_data_flag") {
    if (!canEditGameData(profile)) throw httpError(403, "Officer data-editing permission required.");
    const status = String(params.status || "");
    if (!["reviewing","resolved","rejected"].includes(status)) throw httpError(400, "Invalid flag status.");
    const result = await dbPool().query("update public.data_flags set status=$2,resolution_notes=$3,resolved_by=$4::uuid where id=$1::uuid returning *", [params.flag_id, status, params.resolution_notes || "", profile.id]);
    if (!result.rows[0]) throw httpError(404, "Accuracy flag not found.");
    await audit(dbPool(), profile, `data-flag.${status}`, "data_flags", result.rows[0]);
    return result.rows[0];
  }

  if (name === "place_auction_bid") {
    return transaction(async (client) => {
      const amount = Number(params.bid_amount || 0);
      const auctionResult = await client.query("select * from public.auctions where id=$1::uuid for update", [params.target_auction]);
      const auction = auctionResult.rows[0];
      if (!auction || auction.status !== "open" || (auction.ends_at && new Date(auction.ends_at) <= new Date())) throw httpError(409, "This auction is not open.");
      if (!Number.isSafeInteger(amount) || amount <= Number(auction.current_bid || auction.starting_bid || 0)) throw httpError(400, "Bid must exceed the current bid.");
      const bidderResult = await client.query("select * from public.profiles where id=$1::uuid for update", [profile.id]);
      const bidder = bidderResult.rows[0];
      if (Number(bidder.points_balance) < amount) throw httpError(400, "You do not have enough points.");
      if (auction.current_winner_id) await client.query("update public.profiles set points_balance=points_balance+$2 where id=$1::uuid", [auction.current_winner_id, Number(auction.current_bid || 0)]);
      await client.query("update public.profiles set points_balance=points_balance-$2 where id=$1::uuid", [profile.id, amount]);
      await client.query("insert into public.auction_bids(auction_id,bidder_id,amount) values($1::uuid,$2::uuid,$3)", [auction.id, profile.id, amount]);
      const updated = await client.query("update public.auctions set current_bid=$2,current_winner_id=$3::uuid where id=$1::uuid returning *", [auction.id, amount, profile.id]);
      await audit(client, profile, "auction.bid", "auctions", updated.rows[0]);
      return amount;
    });
  }

  if (name === "rsvp_operation") {
    const status = String(params.response_status || "tentative");
    if (!["accepted","tentative","declined"].includes(status)) throw httpError(400, "Invalid RSVP status.");
    const result = await dbPool().query(
      `insert into public.operation_attendance(operation_id,member_id,status,crew_role) values($1::uuid,$2::uuid,$3,$4)
       on conflict(operation_id,member_id) do update set status=excluded.status,crew_role=coalesce(nullif(excluded.crew_role,''),operation_attendance.crew_role),updated_at=now() returning *`,
      [params.target_operation, profile.id, status, params.crew_role || ""]
    );
    return Boolean(result.rows[0]);
  }

  if (name === "claim_org_job") {
    const table = String(params.target_table || "");
    if (!["work_orders","contracts"].includes(table)) throw httpError(400, "Unsupported claim type.");
    const result = await dbPool().query(`update public.${ident(table)} set status='claimed',claimed_by=$2::uuid where id=$1::uuid and status='open' returning *`, [params.target_id, profile.id]);
    if (!result.rows[0]) throw httpError(409, "This job is no longer open.");
    await audit(dbPool(), profile, "job.claim", table, result.rows[0]);
    return true;
  }

  if (name === "confirm_live_record") {
    const table = String(params.target_table || "");
    if (!["knowledge_locations","mining_locations","salvage_locations"].includes(table)) throw httpError(400, "Unsupported verification type.");
    return transaction(async (client) => {
      const live = await currentLiveVersion(client);
      if (String(params.live_version) !== live) throw httpError(400, "Confirmation must match the current LIVE patch.");
      const target = await client.query(`select * from public.${ident(table)} where id=$1::uuid for update`, [params.target_id]);
      if (!target.rows[0] || target.rows[0].status === "rejected") throw httpError(404, "This record cannot be confirmed.");
      try {
        await client.query("insert into public.live_confirmations(record_table,record_id,member_id,game_version) values($1,$2::uuid,$3::uuid,$4)", [table, params.target_id, profile.id, live]);
      } catch (error) {
        if (error.code === "23505") throw httpError(409, "You have already confirmed this record for the current LIVE patch.");
        throw error;
      }
      const updated = await client.query(`update public.${ident(table)} set confirmations=coalesce(confirmations,0)+1,last_confirmed_at=now(),game_version=$2 where id=$1::uuid returning *`, [params.target_id, live]);
      await audit(client, profile, "live.confirm", table, updated.rows[0]);
      return updated.rows[0].confirmations;
    });
  }

  if (name === "accept_rescue_request") {
    const result = await dbPool().query("update public.rescue_requests set status='accepted',responder_id=$2::uuid where id=$1::uuid and status='open' returning *", [params.target_request, profile.id]);
    if (!result.rows[0]) throw httpError(409, "This request is no longer open.");
    await audit(dbPool(), profile, "rescue.accept", "rescue_requests", result.rows[0]);
    return true;
  }

  if (name === "mark_notification_read") {
    const result = await dbPool().query("update public.notifications set read_at=now() where id=$1::uuid and member_id=$2::uuid returning id", [params.target_notification, profile.id]);
    if (!result.rows[0]) throw httpError(404, "Notification not found.");
    return true;
  }
  if (name === "mark_all_notifications_read") {
    await dbPool().query("update public.notifications set read_at=now() where member_id=$1::uuid and read_at is null", [profile.id]);
    return true;
  }

  if (name === "resolve_auction") {
    if (!canManageTreasury(profile) && !canManageWarehouse(profile)) throw httpError(403, "Auction management permission required.");
    return transaction(async (client) => {
      const resolution = String(params.resolution || "");
      if (!["completed","cancelled"].includes(resolution)) throw httpError(400, "Invalid auction resolution.");
      const result = await client.query("select * from public.auctions where id=$1::uuid for update", [params.target_auction]);
      const auction = result.rows[0];
      if (!auction || auction.status !== "open") throw httpError(409, "Auction is not open.");
      if (resolution === "cancelled" && auction.current_winner_id) await client.query("update public.profiles set points_balance=points_balance+$2 where id=$1::uuid", [auction.current_winner_id, Number(auction.current_bid || 0)]);
      const updated = await client.query("update public.auctions set status=$2 where id=$1::uuid returning *", [auction.id, resolution]);
      await audit(client, profile, `auction.${resolution}`, "auctions", updated.rows[0]);
      return true;
    });
  }

  if (name === "adjust_warehouse_reservation") {
    if (!canManageWarehouse(profile)) throw httpError(403, "Warehouse permission required.");
    return transaction(async (client) => {
      const delta = Number(params.quantity_delta || 0);
      const result = await client.query("select * from public.warehouse_items where id=$1::uuid for update", [params.target_item]);
      const item = result.rows[0];
      if (!item) throw httpError(404, "Warehouse item not found.");
      const next = Number(item.reserved_quantity || 0) + delta;
      if (next < 0 || next > Number(item.quantity || 0)) throw httpError(400, "Reservation would exceed available stock or fall below zero.");
      const updated = await client.query("update public.warehouse_items set reserved_quantity=$2 where id=$1::uuid returning *", [item.id, next]);
      await client.query("insert into public.inventory_movements(item_name,quantity,unit,movement_type,from_location,to_location,member_id,linked_record,status) values($1,$2,$3,$4,$5,$6,$7::uuid,$8,'complete')", [item.name, Math.abs(delta), item.unit, delta >= 0 ? "reserved" : "released", item.storage_location, params.linked_reference || "Organisation reserve", profile.id, params.linked_reference || ""]);
      await audit(client, profile, "warehouse.reserve", "warehouse_items", updated.rows[0]);
      return next;
    });
  }

  if (name === "generate_shortage_work_orders") {
    if (!canManageWarehouse(profile) && !isOfficerUp(profile)) throw httpError(403, "Work-order permission required.");
    return transaction(async (client) => {
      const live = await currentLiveVersion(client);
      const items = await client.query("select * from public.warehouse_items where coalesce(quantity,0)-coalesce(reserved_quantity,0) < coalesce(minimum_stock,0)");
      let count = 0;
      for (const item of items.rows) {
        const link = `warehouse-shortage:${item.id}`;
        const exists = await client.query("select 1 from public.work_orders where linked_module=$1 and status not in ('completed','cancelled') limit 1", [link]);
        if (exists.rows[0]) continue;
        const available = Number(item.quantity || 0) - Number(item.reserved_quantity || 0);
        await client.query("insert into public.work_orders(title,category,item_name,target_quantity,current_quantity,unit,reward_points,reward_auec,priority,status,linked_module,deadline,game_version,description) values($1,'Warehouse restock',$2,$3,$4,$5,0,0,$6,'open',$7,now()+interval '7 days',$8,$9)", [`Restock ${item.name}`, item.name, Number(item.minimum_stock || 0), Math.max(0, available), item.unit, available <= 0 ? "critical" : "high", link, live, `Automatically created because available stock fell below ${item.minimum_stock} ${item.unit || "units"}.`]);
        count += 1;
      }
      await audit(client, profile, "workorders.generate-shortages", "work_orders", { name: `${count} work orders` });
      return count;
    });
  }

  if (name === "claim_wreck_report") {
    const result = await dbPool().query("update public.wreck_reports set status='claimed',claimed_by=$2::uuid where id=$1::uuid and status in ('open','reported','available') and (expires_at is null or expires_at>now()) returning *", [params.target_wreck, profile.id]);
    if (!result.rows[0]) throw httpError(409, "This wreck is no longer available.");
    await audit(dbPool(), profile, "wreck.claim", "wreck_reports", result.rows[0]);
    return true;
  }

  if (name === "release_data_override") {
    if (!canEditGameData(profile)) throw httpError(403, "Officer data-edit permission required.");
    const table = String(params.table || "");
    if (!["game_catalog","catalog_locations"].includes(table)) throw httpError(400, "Only imported catalogue records can be returned to source control.");
    const existing = await dbPool().query(`select * from public.${ident(table)} where id=$1::uuid`, [params.id]);
    if (!existing.rows[0]) throw httpError(404, "Imported record not found.");
    const result = await dbPool().query(`update public.${ident(table)} set officer_locked=false,officer_overrides='{}'::jsonb,updated_at=now() where id=$1::uuid returning *`, [params.id]);
    await audit(dbPool(), profile, "data-override.release", table, result.rows[0], { previous: existing.rows[0], next: result.rows[0], reason: "Returned to external source control on next import", gameVersion: result.rows[0]?.game_version || "" });
    return result.rows[0];
  }

  throw httpError(400, `Unsupported action: ${name}`);
}

export default async function portalApi(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    assertSameOrigin(request);
    const body = await request.json();
    const { profile, client } = await requireMember();
    const action = String(body.action || "");

    if (action === "profile") return json({ profile });
    if (action === "list") return json({ data: await listRows(client, profile, String(body.table || ""), body.options || {}) });
    if (action === "blueprints") {
      const blueprints = await listRows(client, profile, "blueprints", { order: "name", ascending: true });
      const materials = await listRows(client, profile, "blueprint_materials", { order: "created_at", ascending: true });
      return json({ data: blueprints.map((row) => ({ ...row, materials: materials.filter((material) => material.blueprint_id === row.id) })) });
    }
    if (action === "create") return json({ data: await createRow(client, profile, String(body.table || ""), body.payload) }, 201);
    if (action === "update") return json({ data: await updateRow(client, profile, String(body.table || ""), body.id, body.payload) });
    if (action === "delete") return json({ data: await deleteRow(client, profile, String(body.table || ""), body.id) });
    if (action === "createBlueprint") {
      if (!canEditGameData(profile) && !canManageWarehouse(profile)) throw httpError(403, "Crafting management permission required.");
      const result = await transaction(async (tx) => {
        const blueprint = await createRow(tx, profile, "blueprints", body.payload || {});
        const materials = [];
        for (const material of Array.isArray(body.materials) ? body.materials : []) materials.push(await createRow(tx, profile, "blueprint_materials", { ...material, blueprint_id: blueprint.id }));
        return { ...blueprint, materials };
      });
      return json({ data: result }, 201);
    }
    if (action === "rpc") return json({ data: await rpc(profile, String(body.name || ""), body.params || {}) });
    if (action === "snapshot") {
      const output = {};
      const hidden = new Set(["audit_log","sync_sources","live_patch_records","data_source_records","data_import_runs","membership_applications","member_roles","page_content","page_backgrounds"]);
      for (const table of TABLES) {
        if (hidden.has(table)) continue;
        try { output[table] = await listRows(client, profile, table, { order: null, limit: 2000 }); } catch { output[table] = []; }
      }
      return json({ data: output });
    }
    if (action === "backup") {
      if (!isAdmin(profile)) throw httpError(403, "Backup export requires site administration permission.");
      const output = {};
      for (const table of TABLES) {
        try { output[table] = await listRows(client, profile, table, { order: null, includeAllVersions: true, limit: 5000 }); } catch { output[table] = []; }
      }
      return json({ data: output });
    }
    throw httpError(400, "Unsupported portal request.");
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/portal" };
