import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const exists = (file) => fs.existsSync(file);

assert.ok(exists("netlify/database/migrations/0006_live_patch_baseline_and_catalog.sql"));
assert.ok(exists("netlify/database/migrations/0007_discord_integrations.sql"));
assert.ok(exists("netlify/functions/game-data-admin.mjs"));
assert.ok(exists("netlify/functions/game-data-sync-background.mjs"));
assert.ok(exists("netlify/functions/discord-admin.mjs"));

const config = read("config.js");
assert.match(config, /livePatch:\s*"4\.8\.2"/);
assert.match(config, /baselineSourceVersion:\s*"4\.8\.2-LIVE\.12030094"/);

const pages = read("js/pages.js");
assert.match(pages, /id:\s*"catalog"[^\n]+capability:\s*"manage_imports"/);
assert.match(pages, /id:\s*"verification"[^\n]+capability:\s*"manage_imports"/);
assert.match(pages, /id:\s*"crafting"[^\n]+feature:\s*"crafting"/);
assert.doesNotMatch(pages, /Disabled by build/);

const background = read("netlify/functions/game-data-sync-background.mjs");
assert.match(background, /background:\s*true/);

const migration = read("netlify/database/migrations/0006_live_patch_baseline_and_catalog.sql");
assert.match(migration, /material_name text/i);
assert.match(migration, /source_record_id text/i);
assert.match(migration, /Free Navy 4\.8\.2 baseline/);

const index = read("index.html");
assert.match(index, /admin-game-data-overlay\.js/);
assert.match(index, /admin-integrations-overlay\.js/);

console.log("Patch structure tests passed.");
