import { discoverOfficialLiveVersion } from "../lib/official-live.mjs";
import { json, errorResponse } from "../lib/netlify.mjs";

export default async function liveVersion() {
  try { return json(await discoverOfficialLiveVersion(), 200, { "cache-control": "public, max-age=900" }); }
  catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/live-version" };
