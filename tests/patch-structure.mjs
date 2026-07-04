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


const governanceMigration = read("netlify/database/migrations/0004_governance_operations.sql");
assert.match(governanceMigration, /rename column value to setting_value/i);
assert.match(governanceMigration, /add column if not exists setting_value jsonb/i);

const publicConfig = read("netlify/functions/public-config.mjs");
assert.match(publicConfig, /select setting_key,setting_value from public\.site_settings/i);
assert.doesNotMatch(publicConfig, /select setting_key,value from public\.site_settings/i);

const migrationFiles = fs.readdirSync("netlify/database/migrations")
  .filter((name) => name.endsWith(".sql"));
for (const name of migrationFiles) {
  const sql = read(`netlify/database/migrations/${name}`);
  assert.doesNotMatch(
    sql,
    /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;\s*$/gim,
    `${name} must not contain explicit transaction control; Netlify owns the migration transaction.`
  );
}

const migration = read("netlify/database/migrations/0006_live_patch_baseline_and_catalog.sql");
assert.match(migration, /material_name text/i);
assert.match(migration, /source_record_id text/i);
assert.match(migration, /Free Navy 4\.8\.2 baseline/);

const index = read("index.html");
assert.match(index, /admin-game-data-overlay\.js/);
assert.match(index, /admin-integrations-overlay\.js/);

console.log("Patch structure tests passed.");
