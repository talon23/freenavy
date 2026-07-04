import { dbPool, json, errorResponse } from "../lib/netlify.mjs";

export default async function publicConfig(request) {
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  try {
    const client = dbPool();
    const [settings, page] = await Promise.all([
      client.query("select setting_key,coalesce(setting_value,value) as value from public.site_settings where setting_key in ('branding','public_home','membership','operations')"),
      client.query("select page_id,nav_label,title,kicker,hero_title,hero_text,background_url,background_position,overlay_strength,enabled from public.page_settings where page_id='public' limit 1")
    ]);
    return json({
      settings: Object.fromEntries(settings.rows.map((row) => [row.setting_key, row.value])),
      page: page.rows[0] || null
    }, 200, { "cache-control": "public, max-age=60" });
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/public-config" };
