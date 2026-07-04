import { createHash } from "node:crypto";
import { getDatabase } from "@netlify/database";
import { discoverOfficialLiveVersion } from "./official-live.mjs";
import {
  comparePatches,
  fullLiveVersion,
  isLiveRecord,
  normalisePatch,
} from "./patch-version.mjs";

export { comparePatches, isLiveRecord, normalisePatch } from "./patch-version.mjs";

export const BASELINE_SOURCE_VERSION = process.env.STAR_CITIZEN_BASELINE_VERSION || "4.8.2-LIVE.12030094";
export const BASELINE_PATCH = normalisePatch(BASELINE_SOURCE_VERSION)?.patch || "4.8.2";
export const SCW_API_BASE = (process.env.SCW_API_BASE || "https://api.star-citizen.wiki/api").replace(/\/$/, "");

const ALLOWED_CATEGORIES = new Set(["ship", "vehicle", "blueprint"]);
const db = () => getDatabase();

export async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        accept: "application/json",
        "user-agent": process.env.UEX_CLIENT_VERSION || "free-navy-4.8.2-live-sync",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function rows(result) {
  return result?.rows || result || [];
}

function listFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "results", "items", "vehicles", "blueprints", "versions"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function nextFromPayload(payload, currentUrl) {
  const candidate = payload?.links?.next || payload?.meta?.next_page_url || payload?.next || null;
  if (!candidate) return null;
  return new URL(candidate, currentUrl).toString();
}

async function fetchAllPages(initialUrl, headers = {}) {
  const records = [];
  let url = initialUrl;
  let page = 0;
  while (url && page < 200) {
    const payload = await fetchJson(url, { headers });
    records.push(...listFromPayload(payload));
    url = nextFromPayload(payload, url);
    page += 1;
  }
  return records;
}

function sourceId(record) {
  return String(record?.uuid || record?.id || record?.class_name || record?.className || record?.slug || record?.name || "").trim();
}

function recordName(record) {
  return String(
    record?.name
      || record?.display_name
      || record?.displayName
      || record?.title
      || record?.output?.name
      || record?.class_name
      || ""
  ).trim();
}

function manufacturerName(record) {
  const manufacturer = record?.manufacturer;
  if (typeof manufacturer === "string") return manufacturer;
  return manufacturer?.name || manufacturer?.display_name || manufacturer?.code || null;
}

function payloadHash(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function classifyVehicle(record) {
  const haystack = [
    record?.type,
    record?.type_label,
    record?.classification,
    record?.vehicle_type,
    record?.career,
    record?.role,
    record?.description,
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    record?.is_ground_vehicle === true
    || record?.is_ground === true
    || record?.is_gravlev === true
    || (record?.is_vehicle === true && record?.is_spaceship !== true)
  ) return "vehicle";
  if (record?.is_spaceship === true) return "ship";
  if (/ground|rover|tank|wheeled|tracked|gravlev|bike|vehicle/.test(haystack) && !/spaceship|space ship|ship/.test(haystack)) {
    return "vehicle";
  }
  return "ship";
}

export function blueprintMaterials(record) {
  const candidates = [
    record?.materials,
    record?.ingredients,
    record?.resources,
    record?.recipe?.materials,
    record?.recipe?.ingredients,
    record?.manufacturing?.materials,
  ];
  const values = candidates.find(Array.isArray) || [];
  return values.map((material, index) => {
    const nested = material?.material || material?.item || material?.commodity || {};
    const name = String(
      material?.material_name
        || material?.name
        || nested?.name
        || nested?.display_name
        || material?.type
        || `Material ${index + 1}`
    ).trim();
    const key = String(
      material?.uuid
        || material?.id
        || nested?.uuid
        || nested?.id
        || material?.class_name
        || name
    ).trim();
    const amount = material?.quantity ?? material?.amount ?? material?.scu;
    return {
      materialKey: key,
      materialName: name,
      quantity: Number.isFinite(Number(amount)) ? Number(amount) : null,
      unit: material?.unit || material?.measure || (material?.scu != null ? "SCU" : null),
      slotName: String(material?.slot_name || material?.slot || material?.group || ""),
      raw: material,
    };
  }).filter((material) => material.materialKey && material.materialName);
}

function versionValue(entry) {
  if (typeof entry === "string") return entry;
  return entry?.version || entry?.name || entry?.label || entry?.value || entry?.code || null;
}

export async function getWikiDefaultVersion() {
  const payload = await fetchJson(`${SCW_API_BASE}/game-versions/default`);
  const candidate = payload?.data?.version
    || payload?.data?.name
    || payload?.version
    || payload?.name
    || payload?.default;
  return normalisePatch(candidate || BASELINE_SOURCE_VERSION);
}

export async function resolveWikiVersion(requestedVersion = BASELINE_SOURCE_VERSION) {
  const requested = normalisePatch(requestedVersion);
  if (!requested) throw new Error(`Invalid Star Citizen Wiki version: ${requestedVersion}`);
  if (requested.build) return fullLiveVersion(requestedVersion);

  try {
    const payload = await fetchJson(`${SCW_API_BASE}/game-versions`);
    const match = listFromPayload(payload)
      .map(versionValue)
      .filter(Boolean)
      .find((value) => {
        const parsed = normalisePatch(value);
        return parsed?.patch === requested.patch && parsed.build && isLiveRecord({ version: value });
      });
    if (match) return fullLiveVersion(match);
  } catch (error) {
    console.warn("Unable to resolve Wiki version list; using requested patch", error.message);
  }

  const current = await getWikiDefaultVersion().catch(() => null);
  if (current?.patch === requested.patch && current.build) return fullLiveVersion(current.full);
  return requested.patch;
}

export async function fetchWikiCategory(category, version) {
  const endpoint = category === "blueprint" ? "blueprints" : "vehicles";
  const url = new URL(`${SCW_API_BASE}/${endpoint}`);
  url.searchParams.set("version", version);
  url.searchParams.set("page[size]", "200");
  return fetchAllPages(url.toString());
}

async function upsertSourceStatus(sourceKey, values) {
  await db().sql`
    INSERT INTO fn_live_source_status (
      source_key, display_name, status, source_patch, source_version, source_build,
      ships_received, vehicles_received, blueprints_received,
      records_published, records_rejected,
      last_attempt_at, last_success_at, last_error, metadata, updated_at
    ) VALUES (
      ${sourceKey}, ${values.displayName || sourceKey}, ${values.status},
      ${values.sourcePatch || null}, ${values.sourceVersion || null}, ${values.sourceBuild || null},
      ${values.shipsReceived || 0}, ${values.vehiclesReceived || 0}, ${values.blueprintsReceived || 0},
      ${values.published || 0}, ${values.rejected || 0},
      now(), ${values.status === "ok" ? new Date() : null}, ${values.error || null},
      ${JSON.stringify(values.metadata || {})}::jsonb, now()
    )
    ON CONFLICT (source_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      status = EXCLUDED.status,
      source_patch = COALESCE(EXCLUDED.source_patch, fn_live_source_status.source_patch),
      source_version = COALESCE(EXCLUDED.source_version, fn_live_source_status.source_version),
      source_build = COALESCE(EXCLUDED.source_build, fn_live_source_status.source_build),
      ships_received = EXCLUDED.ships_received,
      vehicles_received = EXCLUDED.vehicles_received,
      blueprints_received = EXCLUDED.blueprints_received,
      records_published = EXCLUDED.records_published,
      records_rejected = EXCLUDED.records_rejected,
      last_attempt_at = EXCLUDED.last_attempt_at,
      last_success_at = CASE WHEN EXCLUDED.status = 'ok' THEN now() ELSE fn_live_source_status.last_success_at END,
      last_error = EXCLUDED.last_error,
      metadata = EXCLUDED.metadata,
      updated_at = now()
  `;
}

export async function markWikiSyncRunning({ requestedPatch = BASELINE_SOURCE_VERSION } = {}) {
  const parsed = normalisePatch(requestedPatch) || normalisePatch(BASELINE_SOURCE_VERSION);
  await upsertSourceStatus("star-citizen-wiki", {
    displayName: "Star Citizen Wiki API",
    status: "running",
    sourcePatch: parsed?.patch || BASELINE_PATCH,
    sourceVersion: requestedPatch,
    sourceBuild: parsed?.build || null,
    metadata: { queuedAt: new Date().toISOString() },
  });
}

function normaliseCatalogRecord({ requestedCategory, sourceVersion, parsedSource, record }) {
  const category = requestedCategory === "blueprint" ? "blueprint" : classifyVehicle(record);
  const id = sourceId(record);
  const name = recordName(record);
  if (!id || !name) return { rejected: "missing identifier or name" };
  if (!isLiveRecord(record, sourceVersion)) return { rejected: "test environment record" };
  return {
    source_record_id: id,
    category,
    name,
    manufacturer: manufacturerName(record),
    class_name: record?.class_name || record?.className || null,
    item_type: record?.type_label || record?.type || record?.classification || record?.output?.type_label || null,
    material_name: record?.material_name || null,
    description: record?.description || record?.short_description || record?.output?.description || null,
    raw_payload: record,
    payload_hash: payloadHash(record),
    materials: category === "blueprint" ? blueprintMaterials(record) : [],
    patch_version: parsedSource.patch,
  };
}

function chunks(values, size = 100) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function bulkUpsertCatalog({ sourceKey, sourceVersion, parsedSource, baseline, records }) {
  const published = [];
  for (const batch of chunks(records, 100)) {
    const input = batch.map(({ materials, ...record }) => record);
    const result = await db().sql`
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset(${JSON.stringify(input)}::jsonb) AS item(
          source_record_id text,
          category text,
          name text,
          manufacturer text,
          class_name text,
          item_type text,
          material_name text,
          raw_payload jsonb,
          payload_hash text,
          patch_version text
        )
      )
      INSERT INTO fn_live_game_catalog (
        source_key, source_record_id, category, name, manufacturer, class_name,
        item_type, material_name, patch_version, source_version, source_build,
        environment, verification_state, is_current, raw_payload, payload_hash,
        last_seen_at, updated_at
      )
      SELECT
        ${sourceKey}, source_record_id, category, name, manufacturer, class_name,
        item_type, material_name, patch_version, ${sourceVersion}, ${parsedSource.build},
        'LIVE', ${baseline ? "baseline" : "source_verified"}, true, raw_payload,
        payload_hash, now(), now()
      FROM input
      ON CONFLICT (source_key, category, source_record_id, patch_version) DO UPDATE SET
        name = CASE WHEN fn_live_game_catalog.officer_locked THEN fn_live_game_catalog.name ELSE EXCLUDED.name END,
        manufacturer = CASE WHEN fn_live_game_catalog.officer_locked THEN fn_live_game_catalog.manufacturer ELSE EXCLUDED.manufacturer END,
        class_name = CASE WHEN fn_live_game_catalog.officer_locked THEN fn_live_game_catalog.class_name ELSE EXCLUDED.class_name END,
        item_type = CASE WHEN fn_live_game_catalog.officer_locked THEN fn_live_game_catalog.item_type ELSE EXCLUDED.item_type END,
        material_name = CASE WHEN fn_live_game_catalog.officer_locked THEN fn_live_game_catalog.material_name ELSE EXCLUDED.material_name END,
        source_version = EXCLUDED.source_version,
        source_build = EXCLUDED.source_build,
        is_current = true,
        raw_payload = EXCLUDED.raw_payload,
        payload_hash = EXCLUDED.payload_hash,
        last_seen_at = now(),
        updated_at = now()
      RETURNING id, source_record_id, category
    `;

    const ids = new Map(rows(result).map((row) => [`${row.category}:${row.source_record_id}`, row.id]));
    const blueprintIds = [];
    const materialInput = [];
    for (const record of batch) {
      const catalogId = ids.get(`${record.category}:${record.source_record_id}`);
      if (!catalogId) continue;
      published.push({ ...record, catalogId });
      if (record.category !== "blueprint") continue;
      blueprintIds.push(catalogId);
      for (const material of record.materials) {
        materialInput.push({
          catalog_id: catalogId,
          material_key: material.materialKey,
          material_name: material.materialName,
          quantity: material.quantity,
          unit: material.unit,
          slot_name: material.slotName,
          raw_payload: material.raw,
        });
      }
    }

    if (blueprintIds.length) {
      await db().sql`DELETE FROM fn_live_blueprint_materials WHERE catalog_id = ANY(${blueprintIds}::bigint[])`;
    }
    for (const materialBatch of chunks(materialInput, 300)) {
      if (!materialBatch.length) continue;
      await db().sql`
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset(${JSON.stringify(materialBatch)}::jsonb) AS material(
            catalog_id bigint,
            material_key text,
            material_name text,
            quantity numeric,
            unit text,
            slot_name text,
            raw_payload jsonb
          )
        )
        INSERT INTO fn_live_blueprint_materials (
          catalog_id, material_key, material_name, quantity, unit, slot_name,
          raw_payload, updated_at
        )
        SELECT catalog_id, material_key, material_name, quantity, unit, slot_name,
          raw_payload, now()
        FROM input
        ON CONFLICT (catalog_id, material_key, slot_name) DO UPDATE SET
          material_name = EXCLUDED.material_name,
          quantity = EXCLUDED.quantity,
          unit = EXCLUDED.unit,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
      `;
    }
  }
  return published;
}


async function publishToPortalTables({ sourceKey, sourceVersion, parsedSource, records }) {
  for (const batch of chunks(records, 100)) {
    const catalogInput = batch.map((record) => ({
      source_record_id: record.source_record_id,
      category: record.category,
      name: record.name,
      manufacturer: record.manufacturer,
      class_name: record.class_name,
      item_type: record.item_type,
      description: record.description,
      raw_payload: record.raw_payload,
      patch_version: record.patch_version,
    }));

    await db().sql`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(catalogInput)}::jsonb) AS item(
          source_record_id text,
          category text,
          name text,
          manufacturer text,
          class_name text,
          item_type text,
          description text,
          raw_payload jsonb,
          patch_version text
        )
      )
      INSERT INTO public.game_catalog (
        entity_type, source_name, source_id, game_uuid, name, category,
        subcategory, manufacturer, description, game_version, environment,
        status, confidence, source_payload, imported_at, updated_at
      )
      SELECT
        category, ${sourceKey}, source_record_id,
        CASE WHEN source_record_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN source_record_id ELSE NULL END,
        name, COALESCE(item_type, category), COALESCE(class_name, ''),
        COALESCE(manufacturer, ''), COALESCE(description, ''), patch_version,
        'LIVE', 'active', 'source', raw_payload, now(), now()
      FROM input
      ON CONFLICT (source_name, entity_type, source_id) DO UPDATE SET
        game_uuid = CASE WHEN game_catalog.officer_locked THEN game_catalog.game_uuid ELSE EXCLUDED.game_uuid END,
        name = CASE WHEN game_catalog.officer_locked THEN game_catalog.name ELSE EXCLUDED.name END,
        category = CASE WHEN game_catalog.officer_locked THEN game_catalog.category ELSE EXCLUDED.category END,
        subcategory = CASE WHEN game_catalog.officer_locked THEN game_catalog.subcategory ELSE EXCLUDED.subcategory END,
        manufacturer = CASE WHEN game_catalog.officer_locked THEN game_catalog.manufacturer ELSE EXCLUDED.manufacturer END,
        description = CASE WHEN game_catalog.officer_locked THEN game_catalog.description ELSE EXCLUDED.description END,
        game_version = EXCLUDED.game_version,
        environment = 'LIVE',
        status = 'active',
        confidence = CASE WHEN game_catalog.officer_locked THEN game_catalog.confidence ELSE 'source' END,
        source_payload = EXCLUDED.source_payload,
        imported_at = now(),
        updated_at = now()
    `;

    const blueprintRecords = batch.filter((record) => record.category === "blueprint");
    if (!blueprintRecords.length) continue;
    const blueprintInput = blueprintRecords.map((record) => ({
      source_record_id: record.source_record_id,
      name: record.name,
      category: record.item_type || record.class_name || "Blueprint",
      manufacturer: record.manufacturer,
      raw_payload: record.raw_payload,
      patch_version: record.patch_version,
    }));
    const result = await db().sql`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(blueprintInput)}::jsonb) AS item(
          source_record_id text,
          name text,
          category text,
          manufacturer text,
          raw_payload jsonb,
          patch_version text
        )
      )
      INSERT INTO public.blueprints (
        name, category, status, quality_target, active, source, game_version,
        notes, source_key, source_record_id, source_payload, source_updated_at,
        updated_at
      )
      SELECT
        name, COALESCE(category, 'Blueprint'), 'source', 500, true,
        'Star Citizen Wiki API', patch_version,
        CASE WHEN manufacturer IS NULL OR manufacturer = '' THEN '' ELSE 'Manufacturer: ' || manufacturer END,
        ${sourceKey}, source_record_id, raw_payload, now(), now()
      FROM input
      ON CONFLICT (source_key, source_record_id, game_version) WHERE source_record_id <> '' DO UPDATE SET
        name = CASE WHEN blueprints.officer_locked THEN blueprints.name ELSE EXCLUDED.name END,
        category = CASE WHEN blueprints.officer_locked THEN blueprints.category ELSE EXCLUDED.category END,
        status = CASE WHEN blueprints.officer_locked THEN blueprints.status ELSE 'source' END,
        active = CASE WHEN blueprints.officer_locked THEN blueprints.active ELSE true END,
        source = EXCLUDED.source,
        notes = CASE WHEN blueprints.officer_locked THEN blueprints.notes ELSE EXCLUDED.notes END,
        source_payload = EXCLUDED.source_payload,
        source_updated_at = now(),
        updated_at = now()
      RETURNING id, source_record_id, officer_locked
    `;

    const blueprintMap = new Map(rows(result).map((row) => [String(row.source_record_id), row]));
    const refreshIds = rows(result).filter((row) => !row.officer_locked).map((row) => row.id);
    if (refreshIds.length) {
      await db().sql`DELETE FROM public.blueprint_materials WHERE blueprint_id = ANY(${refreshIds}::uuid[])`;
    }
    const materials = [];
    for (const record of blueprintRecords) {
      const blueprint = blueprintMap.get(String(record.source_record_id));
      if (!blueprint || blueprint.officer_locked) continue;
      for (const material of record.materials) {
        materials.push({
          blueprint_id: blueprint.id,
          material_name: material.materialName,
          quantity: material.quantity,
          unit: material.unit,
          quality_min: 0,
        });
      }
    }
    for (const materialBatch of chunks(materials, 300)) {
      if (!materialBatch.length) continue;
      await db().sql`
        WITH input AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(materialBatch)}::jsonb) AS material(
            blueprint_id uuid,
            material_name text,
            quantity numeric,
            unit text,
            quality_min numeric
          )
        )
        INSERT INTO public.blueprint_materials (
          blueprint_id, material_name, quantity, unit, quality_min
        )
        SELECT blueprint_id, material_name, quantity, unit, quality_min FROM input
      `;
    }
  }
}

async function retireOlderSourceRows(sourceKey, category, patchVersion, sourceIds) {
  if (!sourceIds.length) return;
  await db().sql`
    UPDATE fn_live_game_catalog
    SET is_current = false, updated_at = now()
    WHERE source_key = ${sourceKey}
      AND category = ${category}
      AND patch_version <> ${patchVersion}
      AND source_record_id = ANY(${sourceIds}::text[])
      AND officer_locked = false
  `;
}

export async function syncWiki({ requestedPatch = BASELINE_SOURCE_VERSION, categories = ["ship", "blueprint"] } = {}) {
  const sourceVersion = await resolveWikiVersion(requestedPatch);
  const parsedSource = normalisePatch(sourceVersion);
  if (!parsedSource) throw new Error(`Invalid resolved Wiki version: ${sourceVersion}`);

  const sourceKey = "star-citizen-wiki";
  let published = 0;
  let rejected = 0;
  let shipsReceived = 0;
  let vehiclesReceived = 0;
  let blueprintsReceived = 0;

  try {
    for (const requestedCategory of categories) {
      const sourceRecords = await fetchWikiCategory(requestedCategory, sourceVersion);
      if (sourceRecords.length === 0) {
        throw new Error(`${requestedCategory} source returned zero records; existing data was preserved`);
      }

      const accepted = [];
      for (const sourceRecord of sourceRecords) {
        const record = normaliseCatalogRecord({ requestedCategory, sourceVersion, parsedSource, record: sourceRecord });
        if (record.rejected) {
          rejected += 1;
          continue;
        }
        accepted.push(record);
        if (record.category === "ship") shipsReceived += 1;
        if (record.category === "vehicle") vehiclesReceived += 1;
        if (record.category === "blueprint") blueprintsReceived += 1;
      }

      if (!accepted.length) throw new Error(`${requestedCategory} source contained no usable LIVE records`);
      const imported = await bulkUpsertCatalog({
        sourceKey,
        sourceVersion,
        parsedSource,
        baseline: comparePatches(parsedSource.patch, BASELINE_PATCH) === 0,
        records: accepted,
      });
      await publishToPortalTables({ sourceKey, sourceVersion, parsedSource, records: accepted });
      published += imported.length;

      for (const category of ["ship", "vehicle", "blueprint"]) {
        const sourceIds = imported.filter((record) => record.category === category).map((record) => record.source_record_id);
        await retireOlderSourceRows(sourceKey, category, parsedSource.patch, sourceIds);
      }
    }

    await upsertSourceStatus(sourceKey, {
      displayName: "Star Citizen Wiki API",
      status: "ok",
      sourcePatch: parsedSource.patch,
      sourceVersion,
      sourceBuild: parsedSource.build,
      shipsReceived,
      vehiclesReceived,
      blueprintsReceived,
      published,
      rejected,
      metadata: { categories },
    });

    return {
      sourceKey,
      patch: parsedSource.patch,
      version: sourceVersion,
      shipsReceived,
      vehiclesReceived,
      blueprintsReceived,
      published,
      rejected,
    };
  } catch (error) {
    await upsertSourceStatus(sourceKey, {
      displayName: "Star Citizen Wiki API",
      status: "error",
      sourcePatch: parsedSource.patch,
      sourceVersion,
      sourceBuild: parsedSource.build,
      shipsReceived,
      vehiclesReceived,
      blueprintsReceived,
      published,
      rejected,
      error: error.message,
    });
    throw error;
  }
}

function addPatchCandidate(raw, candidates) {
  const text = String(raw || "").trim();
  if (!text || !isLiveRecord({ version: text })) return;
  const parsed = normalisePatch(text);
  if (!parsed) return;
  candidates.push({ ...parsed, explicitLive: /LIVE/i.test(text) });
}

function extractPatchCandidates(value, candidates = []) {
  if (typeof value === "string") {
    const matches = value.matchAll(/\b\d+\.\d+\.\d+(?:[-.](?:LIVE|PTU|EPTU|EVOCATI|TECH[-_.\s]?PREVIEW)(?:[.-]\d+)?)?/gi);
    for (const match of matches) addPatchCandidate(match[0], candidates);
  } else if (Array.isArray(value)) {
    for (const entry of value) extractPatchCandidates(entry, candidates);
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/version|patch|build|live|channel/i.test(key)) extractPatchCandidates(entry, candidates);
    }
  }
  return candidates;
}

export async function detectOfficialLivePatch() {
  const detected = await discoverOfficialLiveVersion();
  const parsed = normalisePatch(detected.version);
  if (!parsed || String(detected.environment || "").toUpperCase() !== "LIVE") {
    throw new Error("The official LIVE version check did not return a valid LIVE patch");
  }

  const previous = rows(await db().sql`
    SELECT official_live_patch FROM fn_live_patch_state WHERE singleton_id = 1
  `)[0]?.official_live_patch;
  const changed = Boolean(previous && comparePatches(parsed.patch, previous) !== 0);

  await db().sql`
    UPDATE fn_live_patch_state
    SET official_live_patch = ${parsed.patch},
        official_build = ${parsed.build},
        official_source_url = ${detected.source_url || null},
        official_detected_from = ${detected.source || "Official RSI patch notes"},
        last_official_check_at = now(),
        last_official_change_at = CASE WHEN ${changed} THEN now() ELSE last_official_change_at END,
        updated_at = now()
    WHERE singleton_id = 1
  `;

  await db().sql`
    INSERT INTO public.live_patch_records (
      id, environment, version, source_name, source_url, status, checked_at, updated_at
    ) VALUES (
      'current-live', 'LIVE', ${parsed.patch}, ${detected.source || "Official RSI patch notes"},
      ${detected.source_url || null}, 'active', now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      environment = 'LIVE',
      version = EXCLUDED.version,
      source_name = EXCLUDED.source_name,
      source_url = EXCLUDED.source_url,
      status = 'active',
      checked_at = now(),
      updated_at = now()
  `;

  await db().sql`
    UPDATE public.sync_sources
    SET required_patch = ${parsed.patch},
        last_success_at = now(),
        status = ${detected.fallback_used ? "fallback" : "configured"},
        updated_at = now()
    WHERE source_name IN (
      'Official RSI LIVE version',
      'UEX commodities and routes',
      'Free Navy member verification',
      'Star Citizen Wiki game data',
      'UEX item and location data'
    )
  `;

  if (changed) {
    await db().sql`
      UPDATE fn_live_game_catalog
      SET verification_state = CASE
            WHEN officer_locked THEN verification_state
            ELSE 'needs_verification'
          END,
          updated_at = now()
      WHERE is_current = true
        AND patch_version <> ${parsed.patch}
    `;
  }

  return {
    patch: parsed.patch,
    build: parsed.build || null,
    changed,
    source: detected.source,
    sourceUrl: detected.source_url,
    fallbackUsed: Boolean(detected.fallback_used),
  };
}

export async function createPatchCampaign({ targetPatch, createdBy, notes = null }) {
  const target = normalisePatch(targetPatch);
  if (!target) throw new Error("A valid target patch is required");

  const state = rows(await db().sql`
    SELECT baseline_patch, official_live_patch FROM fn_live_patch_state WHERE singleton_id = 1
  `)[0] || {};
  const fromPatch = state.baseline_patch || BASELINE_PATCH;

  const campaign = rows(await db().sql`
    INSERT INTO fn_live_patch_campaigns (from_patch, target_patch, title, status, created_by, notes)
    VALUES (${fromPatch}, ${target.patch}, ${`${fromPatch} to ${target.patch} LIVE verification`}, 'open', ${createdBy || null}, ${notes})
    ON CONFLICT (from_patch, target_patch) DO UPDATE SET
      status = CASE WHEN fn_live_patch_campaigns.status = 'complete' THEN fn_live_patch_campaigns.status ELSE 'open' END,
      notes = COALESCE(EXCLUDED.notes, fn_live_patch_campaigns.notes)
    RETURNING id
  `)[0];

  await db().sql`
    INSERT INTO fn_live_verification_tasks (
      campaign_id, catalog_id, category, record_name, material_name,
      source_key, source_record_id, from_patch, target_patch
    )
    SELECT
      ${campaign.id}, c.id, c.category, c.name, COALESCE(m.material_name, ''),
      COALESCE(c.source_key, ''), COALESCE(c.source_record_id, ''), ${fromPatch}, ${target.patch}
    FROM fn_live_game_catalog c
    LEFT JOIN fn_live_blueprint_materials m ON m.catalog_id = c.id
    WHERE c.is_current = true
      AND c.environment = 'LIVE'
      AND c.patch_version <> ${target.patch}
    ON CONFLICT (campaign_id, category, source_key, source_record_id, material_name) DO NOTHING
  `;

  const taskCount = rows(await db().sql`
    SELECT count(*)::int AS count FROM fn_live_verification_tasks WHERE campaign_id = ${campaign.id}
  `)[0]?.count || 0;

  return {
    campaignId: campaign.id,
    fromPatch,
    targetPatch: target.patch,
    taskCount,
    officialLivePatch: state.official_live_patch || null,
  };
}

export async function resetLivePatchData() {
  await db().sql`DELETE FROM public.blueprints WHERE source_key = 'star-citizen-wiki' AND officer_locked = false`;
  await db().sql`DELETE FROM public.game_catalog WHERE source_name = 'star-citizen-wiki' AND officer_locked = false`;
  await db().sql`TRUNCATE fn_live_verification_tasks, fn_live_patch_campaigns, fn_live_blueprint_materials, fn_live_game_catalog RESTART IDENTITY CASCADE`;
  await db().sql`
    UPDATE fn_live_source_status
    SET source_patch = NULL,
        source_version = NULL,
        source_build = NULL,
        status = 'never_run',
        ships_received = 0,
        vehicles_received = 0,
        blueprints_received = 0,
        records_published = 0,
        records_rejected = 0,
        last_attempt_at = NULL,
        last_success_at = NULL,
        last_error = NULL,
        metadata = '{}'::jsonb,
        updated_at = now()
  `;
  await db().sql`
    UPDATE fn_live_patch_state
    SET baseline_patch = ${BASELINE_PATCH},
        baseline_source_version = ${BASELINE_SOURCE_VERSION},
        official_live_patch = NULL,
        official_build = NULL,
        official_source_url = NULL,
        official_detected_from = NULL,
        last_official_check_at = NULL,
        last_official_change_at = NULL,
        updated_at = now()
    WHERE singleton_id = 1
  `;
  return { reset: true, baselinePatch: BASELINE_PATCH, baselineSourceVersion: BASELINE_SOURCE_VERSION };
}

export async function getAdminSummary() {
  const [patchState, sources, counts, campaigns] = await Promise.all([
    db().sql`SELECT * FROM fn_live_patch_state WHERE singleton_id = 1`,
    db().sql`SELECT * FROM fn_live_source_status ORDER BY display_name`,
    db().sql`
      SELECT category, patch_version, count(*)::int AS count
      FROM fn_live_game_catalog
      WHERE is_current = true AND environment = 'LIVE'
      GROUP BY category, patch_version
      ORDER BY category, patch_version
    `,
    db().sql`
      SELECT c.*,
        count(t.id)::int AS task_count,
        count(t.id) FILTER (WHERE t.status IN ('verified', 'changed', 'not_found'))::int AS completed_count
      FROM fn_live_patch_campaigns c
      LEFT JOIN fn_live_verification_tasks t ON t.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 20
    `,
  ]);

  return {
    patchState: rows(patchState)[0] || null,
    sources: rows(sources),
    counts: rows(counts),
    campaigns: rows(campaigns),
  };
}
