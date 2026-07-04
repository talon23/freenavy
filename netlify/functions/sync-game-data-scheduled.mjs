import { runGameImport } from "../lib/game-import.mjs";
import { createBackup } from "../lib/backup.mjs";

export default async function scheduledGameData() {
  await createBackup({ type: "pre_import", createdBy: null });
  await runGameImport({ source: "all", requestedBy: null, triggerType: "scheduled" });
  return new Response(null, { status: 204 });
}

export const config = { schedule: "17 3 * * *" };
