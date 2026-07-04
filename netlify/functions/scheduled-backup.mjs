import { createBackup, pruneBackups } from "../lib/backup.mjs";

export default async function scheduledBackup() {
  const day = new Date().getUTCDay();
  await createBackup({ type: day === 0 ? "weekly" : "daily", createdBy: null });
  await pruneBackups();
  return new Response(null, { status: 204 });
}

export const config = { schedule: "35 2 * * *" };
