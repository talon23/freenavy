import { verifyRequestOrigin } from "@netlify/identity";
import { requireGameDataAdmin } from "../lib/admin-identity.mjs";
import {
  BASELINE_SOURCE_VERSION,
  markWikiSyncRunning,
  syncWiki,
} from "../lib/live-patch-data.mjs";

export default async function gameDataSyncBackground(request) {
  const auth = await requireGameDataAdmin();
  if (auth.response) return auth.response;
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  try {
    verifyRequestOrigin(request);
    const body = await request.json().catch(() => ({}));
    const requestedPatch = body.patch || BASELINE_SOURCE_VERSION;
    const categories = body.categories || ["ship", "blueprint"];
    await markWikiSyncRunning({ requestedPatch });
    const result = await syncWiki({ requestedPatch, categories });
    console.log("Free Navy background game-data import complete", {
      requestedBy: auth.user.email || auth.user.id,
      ...result,
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("game-data-sync-background", error);
    return Response.json({ ok: false, error: error.message || "Background import failed" }, { status: 500 });
  }
}

export const config = { path: "/api/game-data-sync-background", background: true };
