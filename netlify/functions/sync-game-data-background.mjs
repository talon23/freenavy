import { assertSameOrigin, requireMember, canManageImports, json, errorResponse, httpError } from "../lib/netlify.mjs";
import { runGameImport } from "../lib/game-import.mjs";
import { createBackup } from "../lib/backup.mjs";

export default async function syncGameData(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    assertSameOrigin(request);
    const { profile } = await requireMember();
    if (!canManageImports(profile)) throw httpError(403, "Officer access or an Admin appointment is required to run data imports.");
    const body = await request.json().catch(() => ({}));
    const source = ["all","wiki","uex"].includes(body.source) ? body.source : "all";
    const dryRun = Boolean(body.dry_run);
    const backup = dryRun ? null : await createBackup({ type: "pre_import", createdBy: profile.id });
    const result = await runGameImport({ source, requestedBy: profile.id, triggerType: "manual", dryRun });
    return json({ accepted: true, source, dry_run: dryRun, backup, result });
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/sync-game-data", background: true };
