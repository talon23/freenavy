import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { TABLES, dbPool } from "./netlify.mjs";

const store = () => getStore({ name: "free-navy-backups", consistency: "strong" });
const EXCLUDED = new Set(["backup_records"]);
const SAFE_RESTORE_TABLES = [
  "announcements","warehouse_items","inventory_movements","blueprints","blueprint_materials","production_jobs","work_orders",
  "refinery_jobs","knowledge_locations","mining_locations","salvage_locations","wreck_reports","auctions","market_listings","contracts",
  "operations","operation_templates","operation_updates","crew_availability","fleet_ships","rescue_requests","exploration_routes","intel_reports",
  "incident_reports","training_courses","member_qualifications","equipment_kits","wikelo_projects","sync_sources","page_content","page_backgrounds",
  "departments","recruitment_blocks","feature_flags","site_settings","knowledge_articles","knowledge_article_revisions"
];

function checksum(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function keyFor(type) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `${type}/${stamp}-${crypto.randomUUID()}.json`;
}

export async function createBackup({ type = "manual", createdBy = null } = {}) {
  const client = dbPool();
  const key = keyFor(type);
  const record = await client.query(
    "insert into public.backup_records(backup_key,backup_type,status,created_by) values($1,$2,'running',$3::uuid) returning *",
    [key, type, createdBy]
  );
  try {
    const data = {
      metadata: { format: "free-navy-json-backup-v1", created_at: new Date().toISOString(), backup_type: type },
      tables: {}
    };
    let rowCount = 0;
    for (const table of TABLES) {
      if (EXCLUDED.has(table)) continue;
      try {
        const result = await client.query(`select * from public."${String(table).replaceAll('"','""')}"`);
        data.tables[table] = result.rows;
        rowCount += result.rows.length;
      } catch (error) {
        data.tables[table] = { error: String(error?.message || error) };
      }
    }
    const body = JSON.stringify(data);
    const digest = checksum(body);
    await store().set(key, body, { metadata: { contentType: "application/json", checksum: digest, backupType: type } });
    await client.query(
      "update public.backup_records set status='completed',table_count=$2,row_count=$3,size_bytes=$4,checksum=$5 where id=$1::uuid",
      [record.rows[0].id, Object.keys(data.tables).length, rowCount, Buffer.byteLength(body), digest]
    );
    return { ...record.rows[0], status: "completed", table_count: Object.keys(data.tables).length, row_count: rowCount, size_bytes: Buffer.byteLength(body), checksum: digest };
  } catch (error) {
    await client.query("update public.backup_records set status='failed',error_message=$2 where id=$1::uuid", [record.rows[0].id, String(error?.message || error).slice(0,1000)]);
    throw error;
  }
}

export async function readBackup(key) {
  const result = await store().getWithMetadata(key, { type: "text", consistency: "strong" });
  if (!result) return null;
  return { text: result.data, metadata: result.metadata || {} };
}

export async function deleteBackup(key) {
  await store().delete(key);
  await dbPool().query("update public.backup_records set status='deleted' where backup_key=$1", [key]);
}

export async function restoreBackup({ key, tables = [], actorId = null } = {}) {
  const backup = await readBackup(key);
  if (!backup) throw new Error("Backup not found.");
  const parsed = JSON.parse(backup.text);
  if (parsed?.metadata?.format !== "free-navy-json-backup-v1" || !parsed.tables) throw new Error("Unsupported backup format.");
  const selected = (Array.isArray(tables) && tables.length ? tables : SAFE_RESTORE_TABLES).filter((table) => SAFE_RESTORE_TABLES.includes(table) && Array.isArray(parsed.tables[table]));
  const client = await dbPool().connect();
  const summary = {};
  try {
    await client.query("begin");
    for (const table of selected) {
      let restored = 0;
      for (const row of parsed.tables[table]) {
        const clean = Object.fromEntries(Object.entries(row).filter(([key]) => /^[a-z_][a-z0-9_]*$/i.test(key)));
        const columns = Object.keys(clean);
        if (!columns.length) continue;
        const values = Object.values(clean);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
        const updates = columns.filter((column) => column !== "id").map((column) => `"${column}"=excluded."${column}"`).join(",");
        const conflict = columns.includes("id") ? ` on conflict(id) do update set ${updates || 'id=excluded.id'}` : "";
        await client.query(`insert into public."${table}" (${columns.map((column)=>`"${column}"`).join(",")}) values(${placeholders})${conflict}`, values);
        restored += 1;
      }
      summary[table] = restored;
    }
    await client.query("insert into public.audit_log(actor_id,action,entity_type,entity_name) values($1::uuid,'backup.restore','backup_records',$2)", [actorId, key]);
    await client.query("commit");
    return summary;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

export async function pruneBackups() {
  const client = dbPool();
  const result = await client.query(
    `select backup_key from public.backup_records where status='completed' and (
      (backup_type='daily' and created_at<now()-interval '14 days') or
      (backup_type='weekly' and created_at<now()-interval '56 days') or
      (backup_type='pre_import' and created_at<now()-interval '14 days')
    )`
  );
  for (const row of result.rows) await deleteBackup(row.backup_key);
  return result.rows.length;
}
