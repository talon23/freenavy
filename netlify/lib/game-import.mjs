import crypto from "node:crypto";
import { dbPool, currentLiveVersion } from "./netlify.mjs";

const WIKI_BASE = "https://api.star-citizen.wiki/api";
const UEX_BASE = "https://api.uexcorp.uk/2.0";

function arrayData(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.data && typeof payload.data === "object") return Object.values(payload.data).flatMap((value) => Array.isArray(value) ? value : [value]);
  return [];
}
function text(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") return String(value.en_EN || value.en || value.name || value.label || fallback);
  return fallback;
}
function first(...values) { return values.find((value) => value !== undefined && value !== null && value !== ""); }
function sourceId(row, fallback) { return text(first(row?.uuid, row?.id, row?.class_name, row?.className, row?.slug, fallback)); }
function versionBase(value) {
  const match = String(value || "").match(/\d+\.\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}
function environment(value) {
  const upper = String(value || "").toUpperCase();
  if (upper.includes("EPTU")) return "EPTU";
  if (upper.includes("PTU")) return "PTU";
  if (upper.includes("EVOCATI")) return "EVOCATI";
  return upper.includes("LIVE") ? "LIVE" : "";
}
function hashPayload(payload) { return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"); }
function asArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function liveCompatible(row, payload, liveVersion) {
  const rawVersion = first(row?.game_version, row?.version, row?.gameVersion, row?.version_label, payload?.meta?.version, payload?.version);
  const env = environment(first(row?.environment, row?.channel, rawVersion));
  const base = versionBase(rawVersion);
  if (env && env !== "LIVE") return false;
  if (base && base !== liveVersion) return false;
  return true;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: "application/json", ...headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status === "error") throw new Error(payload?.message || `${response.status} from ${url}`);
  return payload;
}

function extractVersionRecord(payload) {
  const rows = arrayData(payload);
  const row = rows.find((item) => {
    const env = environment(first(item?.environment, item?.channel, item?.code, item?.name, item?.version));
    return env === "LIVE" || item?.is_live === true || item?.live === true || item?.is_default === true;
  }) || payload?.data || rows[0] || payload || {};
  const full = text(first(row?.code, row?.version, row?.name, row?.label, row?.game_version));
  return { full, base: versionBase(full), environment: environment(first(row?.environment, row?.channel, full)) || "LIVE" };
}

async function wikiVersionForLive(liveVersion) {
  const payload = await fetchJson(`${WIKI_BASE}/game-versions/default`);
  const version = extractVersionRecord(payload);
  if (version.environment !== "LIVE" || !version.base || version.base !== liveVersion) {
    throw new Error(`Star Citizen Wiki supports ${version.full || "an unknown version"}, not LIVE ${liveVersion}. No Wiki records were published.`);
  }
  return version.full || liveVersion;
}

async function fetchWikiPages(resource, pinnedVersion) {
  const rows = [];
  const perPage = 100;
  for (let page = 1; page <= 200; page += 1) {
    const url = `${WIKI_BASE}/${resource}?version=${encodeURIComponent(pinnedVersion)}&page=${page}&per_page=${perPage}`;
    const payload = await fetchJson(url);
    const batch = arrayData(payload);
    rows.push(...batch);
    const meta = payload?.meta || payload?.pagination || {};
    const current = Number(first(meta.current_page, meta.currentPage, page));
    const last = Number(first(meta.last_page, meta.lastPage, meta.total_pages, meta.totalPages, 0));
    const next = first(payload?.links?.next, meta.next_page_url, meta.nextPageUrl);
    if (!batch.length || (last && current >= last) || (!last && !next && batch.length < perPage)) break;
    if (!last && !next && page > 1) break;
  }
  return rows.slice(0, 20000);
}

async function verifyUexLiveVersion(headers, liveVersion) {
  const payload = await fetchJson(`${UEX_BASE}/game_versions/`, headers);
  const version = extractVersionRecord(payload);
  if (version.base && version.base !== liveVersion) {
    throw new Error(`UEX supports ${version.full || version.base}, not LIVE ${liveVersion}. No UEX records were published.`);
  }
  if (version.environment && version.environment !== "LIVE") {
    throw new Error(`UEX returned ${version.environment} metadata instead of LIVE data.`);
  }
  return version.full || liveVersion;
}

function normaliseCatalog(row, entityType, sourceName, liveVersion, sourceUrl, fallbackIndex) {
  const output = row?.output || row?.vehicle || row?.item || {};
  const id = sourceId(row, `${entityType}-${fallbackIndex}`);
  const name = text(first(
    row?.name, row?.display_name, row?.displayName, row?.label, row?.commodity_name, row?.item_name, row?.vehicle_name,
    row?.terminal_name, row?.company_name, row?.star_system_name, row?.planet_name, row?.moon_name, row?.city_name,
    row?.space_station_name, row?.outpost_name, row?.poi_name, row?.method_name, row?.refinery_method_name,
    output?.name, output?.display_name
  ), id);
  const category = text(first(row?.category?.name, row?.category, row?.type_label, row?.type, row?.commodity_type, row?.item_type, output?.type_label, output?.type, entityType));
  const subcategory = text(first(row?.subcategory?.name, row?.subcategory, row?.sub_type, row?.subType));
  const manufacturer = text(first(row?.manufacturer?.name, row?.manufacturer_name, row?.manufacturer, output?.manufacturer?.name));
  const description = text(first(row?.description, row?.description_raw, output?.description));
  return { entityType, sourceName, sourceId: id, gameUuid: text(first(row?.uuid, output?.uuid)), name, category, subcategory, manufacturer, description, sourceUrl, payload: row, liveVersion };
}

async function upsertRaw(client, sourceName, recordType, sourceIdValue, liveVersion, payload) {
  await client.query(
    `insert into public.data_source_records(source_name,record_type,source_id,game_version,environment,checksum,raw_payload,imported_at)
     values($1,$2,$3,$4,'LIVE',$5,$6::jsonb,now())
     on conflict(source_name,record_type,source_id,game_version)
     do update set checksum=excluded.checksum,raw_payload=excluded.raw_payload,imported_at=now()`,
    [sourceName, recordType, sourceIdValue, liveVersion, hashPayload(payload), JSON.stringify(payload)]
  );
}

async function upsertCatalog(client, record) {
  const previous = await client.query(
    "select id,source_payload,name,category,subcategory,manufacturer,description,status,confidence,officer_overrides,officer_locked from public.game_catalog where source_name=$1 and entity_type=$2 and source_id=$3",
    [record.sourceName, record.entityType, record.sourceId]
  );
  const previousRow = previous.rows[0] || null;
  const previousHash = previousRow ? hashPayload(previousRow.source_payload || {}) : "";
  const nextHash = hashPayload(record.payload || {});
  const result = await client.query(
    `insert into public.game_catalog(entity_type,source_name,source_id,game_uuid,name,category,subcategory,manufacturer,description,game_version,environment,status,confidence,source_url,source_payload,imported_at)
     values($1,$2,$3,nullif($4,''),$5,$6,$7,$8,$9,$10,'LIVE','active','source',$11,$12::jsonb,now())
     on conflict(source_name,entity_type,source_id)
     do update set game_uuid=coalesce(nullif(excluded.game_uuid,''),game_catalog.game_uuid),
       name=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'name' then game_catalog.name else excluded.name end,
       category=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'category' then game_catalog.category else excluded.category end,
       subcategory=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'subcategory' then game_catalog.subcategory else excluded.subcategory end,
       manufacturer=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'manufacturer' then game_catalog.manufacturer else excluded.manufacturer end,
       description=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'description' then game_catalog.description else excluded.description end,
       game_version=excluded.game_version,environment='LIVE',
       status=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'status' then game_catalog.status when game_catalog.status='flagged' then 'flagged' else 'active' end,
       confidence=case when game_catalog.officer_locked or game_catalog.officer_overrides ? 'confidence' then game_catalog.confidence else excluded.confidence end,
       source_url=excluded.source_url,source_payload=excluded.source_payload,imported_at=now(),updated_at=now()
     returning id`,
    [record.entityType, record.sourceName, record.sourceId, record.gameUuid, record.name, record.category, record.subcategory, record.manufacturer, record.description, record.liveVersion, record.sourceUrl, JSON.stringify(record.payload)]
  );
  const catalogId = result.rows[0].id;
  if (previousRow && previousHash !== nextHash) {
    await client.query(
      `insert into public.notifications(member_id,title,message,category)
       select member_id,$2,$3,'watchlist' from public.watchlists
       where entity_type='game_catalog' and entity_id=$1`,
      [String(catalogId), `${record.name} changed`, `A monitored ${record.entityType.replaceAll("_", " ")} record was updated by ${record.sourceName}. Review its current LIVE data and any Free Navy corrections.`]
    );
    const locked = previousRow.officer_overrides || {};
    const incoming = { name: record.name, category: record.category, subcategory: record.subcategory, manufacturer: record.manufacturer, description: record.description };
    const conflicts = Object.keys(incoming).filter((key) => Object.prototype.hasOwnProperty.call(locked, key) && String(incoming[key] ?? "") !== String(previousRow[key] ?? ""));
    if (previousRow.officer_locked || conflicts.length) {
      const message = `${record.sourceName} changed ${conflicts.length ? conflicts.join(", ") : "a source-controlled value"} for ${previousRow.name}. The Free Navy officer correction was preserved.`;
      await client.query(
        `insert into public.notifications(member_id,title,message,category)
         select distinct p.id,$1,$2,'data-conflict' from public.profiles p
         left join public.member_roles mr on mr.profile_id=p.id and mr.role='admin' and mr.active=true and (mr.expires_at is null or mr.expires_at>now())
         where p.status='active' and (p.rank in ('president','vice_president','general','admiral','vice_admiral','rear_admiral','brigadier_general','officer') or mr.id is not null)`,
        [`Officer correction preserved`, message]
      );
      await client.query(
        `insert into public.record_history(entity_type,entity_id,action,previous_values,new_values,reason,source_name,game_version)
         values('game_catalog',$1,'source-conflict-preserved',$2::jsonb,$3::jsonb,$4,$5,$6)`,
        [String(catalogId), JSON.stringify(previousRow), JSON.stringify(record.payload || {}), message, record.sourceName, record.liveVersion]
      );
    }
  }
  return catalogId;
}

function materialRows(blueprint) {
  const candidates = first(blueprint?.ingredients, blueprint?.materials, blueprint?.resources, blueprint?.inputs, blueprint?.recipe?.ingredients, []);
  return asArray(candidates).map((item, index) => ({
    name: text(first(item?.name, item?.item?.name, item?.resource?.name, item?.commodity?.name), `Material ${index + 1}`),
    quantity: number(first(item?.quantity, item?.amount, item?.count, item?.units, 1)),
    unit: text(first(item?.unit, item?.unit_label, "units")),
    quality: number(first(item?.quality_min, item?.minimum_quality, item?.quality, 0))
  })).filter((item) => item.name);
}

async function upsertBlueprint(client, row, sourceName, liveVersion, sourceUrl, index) {
  const normal = normaliseCatalog(row, "blueprint", sourceName, liveVersion, sourceUrl, index);
  const externalKey = `${sourceName}:blueprint:${normal.sourceId}`;
  const result = await client.query(
    `insert into public.blueprints(name,category,status,quality_target,active,source,game_version,notes,external_key,source_url,source_payload)
     values($1,$2,'active',0,true,$3,$4,$5,$6,$7,$8::jsonb)
     on conflict(external_key) do update set name=excluded.name,category=excluded.category,status='active',active=true,source=excluded.source,
       game_version=excluded.game_version,source_url=excluded.source_url,source_payload=excluded.source_payload,updated_at=now()
     returning id`,
    [normal.name, normal.category, sourceName, liveVersion, normal.description, externalKey, sourceUrl, JSON.stringify(row)]
  );
  await client.query("delete from public.blueprint_materials where blueprint_id=$1::uuid", [result.rows[0].id]);
  for (const material of materialRows(row)) {
    await client.query("insert into public.blueprint_materials(blueprint_id,material_name,quantity,unit,quality_min) values($1::uuid,$2,$3,$4,$5)", [result.rows[0].id, material.name, material.quantity, material.unit, material.quality]);
  }
  await upsertCatalog(client, normal);
}

function locationCandidates(row) {
  const directLocation = first(
    row?.terminal_name, row?.space_station_name, row?.city_name, row?.outpost_name, row?.planet_name, row?.moon_name,
    row?.location_name, row?.star_system_name, row?.poi_name, row?.refinery_name
  ) ? [row] : [];
  return [
    ...directLocation, ...asArray(row?.locations), ...asArray(row?.shops), ...asArray(row?.prices), ...asArray(row?.terminals),
    ...asArray(row?.purchase_locations), ...asArray(row?.rental_locations), ...asArray(row?.availability)
  ];
}

async function upsertLocations(client, catalogId, normal, row) {
  let count = 0;
  for (const [index, place] of locationCandidates(row).entries()) {
    const locationName = text(first(place?.location_name, place?.location?.name, place?.name, place?.city_name, place?.space_station_name, place?.outpost_name));
    if (!locationName) continue;
    const terminalName = text(first(place?.terminal_name, place?.terminal?.name, place?.shop_name, place?.shop?.name));
    const externalKey = `${normal.sourceName}:${normal.entityType}:${normal.sourceId}:location:${text(first(place?.id, place?.uuid, `${locationName}:${terminalName}:${index}`))}`;
    await client.query(
      `insert into public.catalog_locations(external_key,catalog_id,entity_name,category,system_name,body_name,location_name,terminal_name,purchase_price_auec,rental_price_auec,source_name,source_id,source_url,game_version,environment,confidence,status,source_payload,imported_at)
       values($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'LIVE','source','active',$15::jsonb,now())
       on conflict(external_key) do update set
         entity_name=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'entity_name' then catalog_locations.entity_name else excluded.entity_name end,
         category=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'category' then catalog_locations.category else excluded.category end,
         system_name=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'system_name' then catalog_locations.system_name else excluded.system_name end,
         body_name=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'body_name' then catalog_locations.body_name else excluded.body_name end,
         location_name=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'location_name' then catalog_locations.location_name else excluded.location_name end,
         terminal_name=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'terminal_name' then catalog_locations.terminal_name else excluded.terminal_name end,
         purchase_price_auec=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'purchase_price_auec' then catalog_locations.purchase_price_auec else excluded.purchase_price_auec end,
         rental_price_auec=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'rental_price_auec' then catalog_locations.rental_price_auec else excluded.rental_price_auec end,
         game_version=excluded.game_version,environment='LIVE',
         status=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'status' then catalog_locations.status else 'active' end,
         confidence=case when catalog_locations.officer_locked or catalog_locations.officer_overrides ? 'confidence' then catalog_locations.confidence else excluded.confidence end,
         source_payload=excluded.source_payload,imported_at=now(),updated_at=now()`,
      [externalKey, catalogId, normal.name, normal.category, text(first(place?.star_system_name, place?.system_name, place?.system?.name)), text(first(place?.planet_name, place?.moon_name, place?.body_name, place?.body?.name)), locationName, terminalName, number(first(place?.price_buy, place?.purchase_price, place?.price, 0)), number(first(place?.price_rent, place?.rental_price, 0)), normal.sourceName, text(first(place?.id, place?.uuid, index)), normal.sourceUrl, normal.liveVersion, JSON.stringify(place)]
    );
    count += 1;
  }
  return count;
}

async function importWiki(client, liveVersion, runId) {
  const sourceName = "Star Citizen Wiki game data";
  const resources = ["blueprints","vehicles","items","commodities","locations"];
  const pinnedVersion = await wikiVersionForLive(liveVersion);
  let received = 0, published = 0, rejected = 0;
  for (const resource of resources) {
    const sourceUrl = `${WIKI_BASE}/${resource}?version=${encodeURIComponent(pinnedVersion)}`;
    const rows = await fetchWikiPages(resource, pinnedVersion);
    const payload = { meta: { version: pinnedVersion }, data: rows };
    received += rows.length;
    for (const [index, row] of rows.entries()) {
      if (!liveCompatible(row, payload, liveVersion)) { rejected += 1; continue; }
      const id = sourceId(row, `${resource}-${index}`);
      await upsertRaw(client, sourceName, resource, id, liveVersion, row);
      if (resource === "blueprints") await upsertBlueprint(client, row, sourceName, liveVersion, sourceUrl, index);
      else {
        const entityType = resource === "vehicles" ? "ship_vehicle" : resource === "items" ? "item" : resource === "commodities" ? "commodity" : "location";
        const normal = normaliseCatalog(row, entityType, sourceName, liveVersion, sourceUrl, index);
        const catalogId = await upsertCatalog(client, normal);
        await upsertLocations(client, catalogId, normal, row);
      }
      published += 1;
    }
  }
  return { received, published, rejected };
}

async function fetchUexItemCatalogue(headers, warnings) {
  const categoryPayload = await fetchJson(`${UEX_BASE}/categories/?type=item`, headers);
  const categories = arrayData(categoryPayload)
    .filter((row) => row?.id != null && String(row?.type || "item").toLowerCase() === "item" && Number(row?.is_game_related ?? 1) !== 0)
    .slice(0, 300);
  const collected = [];
  const chunkSize = 6;
  for (let start = 0; start < categories.length; start += chunkSize) {
    const chunk = categories.slice(start, start + chunkSize);
    const results = await Promise.all(chunk.map(async (category) => {
      try {
        const payload = await fetchJson(`${UEX_BASE}/items/?id_category=${encodeURIComponent(category.id)}`, headers);
        return arrayData(payload);
      } catch (error) {
        warnings.push(`items category ${category.id}: ${error?.message || error}`);
        return [];
      }
    }));
    collected.push(...results.flat());
  }
  const unique = new Map();
  for (const [index, row] of collected.entries()) unique.set(sourceId(row, `item-${index}`), row);
  return { data: [...unique.values()], meta: { category_count: categories.length } };
}

async function importUex(client, liveVersion, runId) {
  const sourceName = "UEX item and location data";
  const resources = [
    { resource: "commodities", entityType: "commodity", core: true },
    { resource: "items", entityType: "item", core: true, categoryFanout: true },
    { resource: "vehicles", entityType: "ship_vehicle", core: true },
    { resource: "terminals", entityType: "terminal", core: true },
    { resource: "categories", entityType: "category" },
    { resource: "companies", entityType: "manufacturer" },
    { resource: "star_systems", entityType: "star_system" },
    { resource: "planets", entityType: "planet" },
    { resource: "moons", entityType: "moon" },
    { resource: "cities", entityType: "city" },
    { resource: "space_stations", entityType: "space_station" },
    { resource: "outposts", entityType: "outpost" },
    { resource: "jump_points", entityType: "jump_point" },
    { resource: "poi", entityType: "point_of_interest" },
    { resource: "refineries_methods", entityType: "refinery_method" },
    { resource: "refineries_yields", entityType: "refinery_yield" },
    { resource: "refineries_capacities", entityType: "refinery_capacity" },
    { resource: "fuel_prices_all", entityType: "fuel_price" },
    { resource: "commodities_prices_all", entityType: "commodity_price" },
    { resource: "commodities_raw_prices_all", entityType: "raw_material_price" },
    { resource: "items_prices_all", entityType: "item_price" },
    { resource: "vehicles_purchases_prices_all", entityType: "vehicle_purchase_price" },
    { resource: "vehicles_rentals_prices_all", entityType: "vehicle_rental_price" }
  ];
  const headers = {
    ...(process.env.UEX_API_TOKEN ? { authorization: `Bearer ${process.env.UEX_API_TOKEN}` } : {}),
    ...(process.env.UEX_CLIENT_VERSION ? { "x-client-version": process.env.UEX_CLIENT_VERSION } : {})
  };
  await verifyUexLiveVersion(headers, liveVersion);
  let received = 0, published = 0, rejected = 0;
  const warnings = [];
  let coreSucceeded = 0;
  for (const config of resources) {
    const sourceUrl = `${UEX_BASE}/${config.resource}/`;
    let payload;
    try { payload = config.categoryFanout ? await fetchUexItemCatalogue(headers, warnings) : await fetchJson(sourceUrl, headers); }
    catch (error) {
      warnings.push(`${config.resource}: ${error?.message || error}`);
      continue;
    }
    const rows = arrayData(payload).slice(0, 20000);
    if (config.core && rows.length) coreSucceeded += 1;
    received += rows.length;
    for (const [index, row] of rows.entries()) {
      if (!liveCompatible(row, payload, liveVersion)) { rejected += 1; continue; }
      const id = sourceId(row, `${config.resource}-${index}`);
      await upsertRaw(client, sourceName, config.resource, id, liveVersion, row);
      const normal = normaliseCatalog(row, config.entityType, sourceName, liveVersion, sourceUrl, index);
      const catalogId = await upsertCatalog(client, normal);
      await upsertLocations(client, catalogId, normal, row);
      published += 1;
    }
  }
  if (!coreSucceeded) throw new Error(`UEX core endpoints returned no usable LIVE records. ${warnings.slice(0,3).join(" | ")}`);
  return { received, published, rejected, warnings };
}

export async function runGameImport({ source = "all", requestedBy = null, triggerType = "manual", dryRun = false } = {}) {
  const pool = dbPool();
  const liveVersion = await currentLiveVersion(pool);
  const sources = source === "all" ? ["wiki","uex"] : [source];
  const results = [];
  for (const key of sources) {
    const sourceName = key === "wiki" ? "Star Citizen Wiki game data" : "UEX item and location data";
    const sourceSettings = await pool.query("select * from public.sync_sources where source_name=$1", [sourceName]);
    if (sourceSettings.rows[0] && (!sourceSettings.rows[0].enabled || sourceSettings.rows[0].paused)) {
      results.push({ source: sourceName, status: "paused", received: 0, published: 0, rejected: 0 });
      continue;
    }
    const run = await pool.query(
      "insert into public.data_import_runs(source_name,requested_by,trigger_type,status,live_version) values($1,$2::uuid,$3,'running',$4) returning id",
      [sourceName, requestedBy, dryRun ? `${triggerType}:dry-run` : triggerType, liveVersion]
    );
    const runId = run.rows[0].id;
    const client = await pool.connect();
    try {
      await client.query("begin");
      const stats = key === "wiki" ? await importWiki(client, liveVersion, runId) : await importUex(client, liveVersion, runId);
      const zeroProtected = sourceSettings.rows[0]?.zero_result_protection !== false;
      if (zeroProtected && stats.received === 0) throw new Error("The source returned zero records. Existing published data was protected.");
      if (dryRun) await client.query("rollback");
      else await client.query("commit");
      const warningText = Array.isArray(stats.warnings) ? stats.warnings.slice(0, 10).join(" | ").slice(0, 1000) : "";
      await pool.query(
        "update public.data_import_runs set status=$2,records_received=$3,records_published=$4,records_rejected=$5,error_message=$6,completed_at=now() where id=$1::uuid",
        [runId, dryRun || warningText ? "partial" : "completed", stats.received, dryRun ? 0 : stats.published, stats.rejected, warningText]
      );
      await pool.query(
        `update public.sync_sources set status=$2,required_patch=$3,last_success_at=case when $2='configured' then now() else last_success_at end,
         last_run_at=now(),records_changed=$4,records_received=$5,records_published=$6,records_rejected=$7,
         consecutive_failures=0,last_error=$8,next_run_at=now()+case when cadence ilike '%3 hour%' then interval '3 hours' else interval '1 day' end
         where source_name=$1`,
        [sourceName, dryRun ? "dry-run" : (warningText ? "partial" : "configured"), liveVersion, dryRun ? 0 : stats.published, stats.received, dryRun ? 0 : stats.published, stats.rejected, warningText]
      );
      results.push({ source: sourceName, ...stats, published: dryRun ? 0 : stats.published, status: dryRun ? "dry-run" : "completed" });
    } catch (error) {
      try { await client.query("rollback"); } catch {}
      await pool.query("update public.data_import_runs set status='failed',error_message=$2,completed_at=now() where id=$1::uuid", [runId, String(error?.message || error).slice(0, 1000)]);
      await pool.query(
        "update public.sync_sources set status='failed',last_run_at=now(),last_error=$2,consecutive_failures=consecutive_failures+1 where source_name=$1",
        [sourceName, String(error?.message || error).slice(0, 1000)]
      );
      results.push({ source: sourceName, status: "failed", error: error?.message || String(error) });
    } finally { client.release(); }
  }
  return { liveVersion, dryRun, results };
}
