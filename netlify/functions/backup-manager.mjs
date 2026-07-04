import { requireMember, assertSameOrigin, json, errorResponse, httpError, canManageBackups, canRestoreBackups, dbPool, audit } from "../lib/netlify.mjs";
import { createBackup, readBackup, deleteBackup, restoreBackup } from "../lib/backup.mjs";

export default async function backupManager(request) {
  try {
    const { profile, client } = await requireMember();
    if (!canManageBackups(profile)) throw httpError(403, "Backup permission required.");
    const url = new URL(request.url);
    if (request.method === "GET") {
      const key = url.searchParams.get("key");
      if (key) {
        const backup = await readBackup(key);
        if (!backup) throw httpError(404, "Backup not found.");
        return new Response(backup.text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="free-navy-backup.json"`, "cache-control": "no-store" } });
      }
      const result = await client.query("select * from public.backup_records order by created_at desc limit 100");
      return json({ data: result.rows });
    }
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "create");
    if (action === "create") {
      const record = await createBackup({ type: "manual", createdBy: profile.id });
      await audit(client, profile, "backup.create", "backup_records", record);
      return json({ data: record }, 201);
    }
    if (action === "preview") {
      const backup = await readBackup(String(body.key || ""));
      if (!backup) throw httpError(404, "Backup not found.");
      const parsed = JSON.parse(backup.text);
      const tables = Object.fromEntries(Object.entries(parsed.tables || {}).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0]));
      return json({ data: { metadata: parsed.metadata, tables } });
    }
    if (action === "restore") {
      if (!canRestoreBackups(profile)) throw httpError(403, "Only the President can restore a backup.");
      if (body.confirmation !== "RESTORE FREE NAVY") throw httpError(400, "Type RESTORE FREE NAVY to confirm.");
      const result = await restoreBackup({ key: String(body.key || ""), tables: body.tables, actorId: profile.id });
      return json({ data: result });
    }
    if (action === "delete") {
      if (!canRestoreBackups(profile)) throw httpError(403, "Only the President can delete stored backups.");
      await deleteBackup(String(body.key || ""));
      return json({ data: true });
    }
    throw httpError(400, "Unsupported backup action.");
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/backups" };
