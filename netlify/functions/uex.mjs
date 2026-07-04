import { requireMember, currentLiveVersion, json, errorResponse, httpError, dbPool } from "../lib/netlify.mjs";

const ALLOWED = new Set([
  "commodities", "commodities_prices", "commodities_routes", "commodities_raw_prices",
  "terminals", "items", "items_prices", "vehicles", "vehicles_prices", "fuel_prices",
  "refineries_methods", "refineries_yields", "refineries_capacities", "star_systems",
  "planets", "moons", "cities", "outposts", "poi", "space_stations", "game_versions"
]);

export default async function uex(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  try {
    await requireMember();
    const url = new URL(request.url);
    const resource = String(url.searchParams.get("resource") || "").replace(/[^a-z0-9_]/gi, "");
    if (!ALLOWED.has(resource)) throw httpError(400, "Unsupported UEX resource.");
    const query = new URLSearchParams();
    for (const [key, value] of url.searchParams) if (key !== "resource" && value !== "") query.set(key, value);
    const response = await fetch(`https://api.uexcorp.uk/2.0/${resource}/?${query}`, {
      headers: {
        accept: "application/json",
        ...(process.env.UEX_API_TOKEN ? { authorization: `Bearer ${process.env.UEX_API_TOKEN}` } : {}),
        ...(process.env.UEX_CLIENT_VERSION ? { "x-client-version": process.env.UEX_CLIENT_VERSION } : {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status === "error") throw httpError(response.status || 502, payload.message || "UEX request failed.");
    const client = dbPool();
    const livePatch = await currentLiveVersion(client);
    const rows = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    const filtered = rows.filter((row) => {
      const versions = [row.game_version, row.game_version_origin, row.game_version_destination].filter(Boolean).map(String);
      return versions.length === 0 || versions.every((version) => version === livePatch);
    });
    await client.query("update public.sync_sources set last_success_at=now(),required_patch=$2,status='configured',records_changed=$3 where source_name=$1", ["UEX commodities and routes", livePatch, filtered.length]);
    return json({ status: "ok", data: filtered, supported_version: livePatch, rejected_non_live_rows: rows.length - filtered.length }, 200, { "cache-control": "private, max-age=300" });
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/uex" };
