import { verifyRequestOrigin } from "@netlify/identity";
import { requireGameDataAdmin } from "../lib/admin-identity.mjs";
import {
  BASELINE_SOURCE_VERSION,
  createPatchCampaign,
  detectOfficialLivePatch,
  getAdminSummary,
  resetLivePatchData,
  syncWiki,
} from "../lib/live-patch-data.mjs";

export default async function gameDataAdmin(request) {
  const auth = await requireGameDataAdmin();
  if (auth.response) return auth.response;

  try {
    if (request.method === "GET") {
      return Response.json(await getAdminSummary());
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    verifyRequestOrigin(request);
    const body = await request.json().catch(() => ({}));
    let result;

    switch (body.action) {
      case "check-live":
        result = await detectOfficialLivePatch();
        break;
      case "sync-baseline":
        result = await syncWiki({ requestedPatch: BASELINE_SOURCE_VERSION, categories: ["ship", "blueprint"] });
        break;
      case "sync-wiki":
        result = await syncWiki({
          requestedPatch: body.patch || BASELINE_SOURCE_VERSION,
          categories: body.categories || ["ship", "blueprint"],
        });
        break;
      case "create-campaign":
        result = await createPatchCampaign({
          targetPatch: body.targetPatch,
          createdBy: auth.user.email || auth.user.id,
          notes: body.notes || null,
        });
        break;
      case "reset-test-data":
        if (body.confirmation !== "RESET 4.8.2 DATA") {
          return Response.json({ error: "Reset confirmation text did not match" }, { status: 400 });
        }
        result = await resetLivePatchData();
        break;
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    return Response.json({ result, summary: await getAdminSummary() });
  } catch (error) {
    console.error("game-data-admin", error);
    const status = /invalid|required|confirmation|zero records/i.test(error.message || "") ? 400 : 500;
    return Response.json({ error: error.message || "Game data operation failed" }, { status });
  }
}

export const config = {
  path: "/api/game-data-admin",
};
