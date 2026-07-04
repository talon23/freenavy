import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const full = (file) => path.join(root, file);
const exists = (file) => fs.existsSync(full(file));
const read = (file) => fs.readFileSync(full(file), "utf8");
const write = (file, content) => fs.writeFileSync(full(file), content);

function addConfigLine(content, anchorPattern, line) {
  if (content.includes(line.trim())) return content;
  return content.replace(anchorPattern, (match) => `${match}\n  ${line}`);
}

function patchConfig() {
  const file = "config.js";
  if (!exists(file)) throw new Error("config.js was not found. Run this script from the GitHub repository root.");
  let content = read(file);
  content = content.replace(/livePatch:\s*["'][^"']+["']/, 'livePatch: "4.8.2"');
  content = addConfigLine(content, /livePatch:\s*"4\.8\.2",/, 'baselinePatch: "4.8.2",');
  content = addConfigLine(content, /baselinePatch:\s*"4\.8\.2",/, 'baselineSourceVersion: "4.8.2-LIVE.12030094",');
  content = addConfigLine(content, /gameDataSyncPath:\s*["'][^"']+["'],/, 'gameDataAdminPath: "/api/game-data-admin",');
  content = addConfigLine(content, /gameDataAdminPath:\s*["'][^"']+["'],/, 'gameDataBackgroundPath: "/api/game-data-sync-background",');
  content = addConfigLine(content, /gameDataBackgroundPath:\s*["'][^"']+["'],/, 'discordAdminPath: "/api/discord-admin",');
  content = addConfigLine(content, /discordAdminPath:\s*["'][^"']+["'],/, 'discordLinkStatusPath: "/api/discord-link-status",');
  write(file, content);
}

function patchIndex() {
  const file = "index.html";
  if (!exists(file)) throw new Error("index.html was not found.");
  let content = read(file);
  const tags = [
    '  <script type="module" src="/js/admin-game-data-overlay.js"></script>',
    '  <script type="module" src="/js/admin-integrations-overlay.js"></script>',
  ];
  for (const tag of tags) {
    if (!content.includes(tag)) content = content.replace("</body>", `${tag}\n</body>`);
  }
  write(file, content);
}

function patchStyles() {
  const target = "styles.css";
  const source = "patches/feature-switch-fix.css";
  if (!exists(target) || !exists(source)) return;
  let content = read(target);
  const start = "/* FREE NAVY FEATURE SWITCH PATCH START */";
  const end = "/* FREE NAVY FEATURE SWITCH PATCH END */";
  const expression = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g");
  content = content.replace(expression, "").trimEnd();
  content += `\n\n${read(source).trim()}\n`;
  write(target, content);
}

function patchPackage() {
  const file = "package.json";
  if (!exists(file)) return;
  const data = JSON.parse(read(file));
  data.version = "4.1.0";
  data.scripts ||= {};
  const checks = [
    "node --check netlify/lib/patch-version.mjs",
    "node --check netlify/lib/live-patch-data.mjs",
    "node --check netlify/lib/admin-identity.mjs",
    "node --check netlify/lib/discord-integration.mjs",
    "node --check netlify/functions/game-data-admin.mjs",
    "node --check netlify/functions/game-data-sync-background.mjs",
    "node --check netlify/functions/live-patch-check-scheduled.mjs",
    "node --check netlify/functions/discord-admin.mjs",
    "node --check netlify/functions/discord-auth-start.mjs",
    "node --check netlify/functions/discord-auth-callback.mjs",
    "node --check netlify/functions/discord-link-status.mjs",
    "node --check js/admin-game-data-overlay.js",
    "node --check js/admin-integrations-overlay.js",
  ];
  const existingChecks = String(data.scripts.check || "").split(" && ").filter(Boolean);
  data.scripts.check = [...new Set([...existingChecks, ...checks])].join(" && ");
  data.scripts["test:live-patch"] = "node tests/live-patch-version.mjs";
  data.scripts["test:import-shapes"] = "node tests/live-patch-import-shapes.mjs";
  data.scripts["test:patch"] = "node tests/patch-structure.mjs";
  data.scripts.validate = "npm run check && npm test && npm run test:live-patch && npm run test:import-shapes && npm run test:patch && npm run build";
  write(file, `${JSON.stringify(data, null, 2)}\n`);
}

function appendSection(file, marker, section) {
  if (!exists(file)) return;
  let content = read(file);
  if (!content.includes(marker)) content = `${content.trimEnd()}\n\n${section.trim()}\n`;
  write(file, content);
}

function patchReadme() {
  const file = "README.md";
  if (!exists(file)) return;
  let content = read(file)
    .replaceAll("STAR_CITIZEN_LIVE_VERSION=4.8.3", "STAR_CITIZEN_BASELINE_VERSION=4.8.2-LIVE.12030094")
    .replace(/Discord webhooks, Discord OAuth, bots and automatic Discord posting remain (?:deliberately|intentionally) disabled\.[^\n]*/g,
      "Discord OAuth account linking and webhook support are installed but disabled by default until their Netlify environment variables are configured.")
    .replace(/Discord automation remains disabled in both the database defaults and server-side feature controls\./g,
      "Discord integrations default to off and can only be enabled from Admin after the required Netlify environment variables are present.");
  write(file, content);
  appendSection(file, "## Free Navy 4.8.2 baseline and Discord patch", `
## Free Navy 4.8.2 baseline and Discord patch

- GitHub is the source of truth and Netlify performs the build, Functions, Identity and Database deployment.
- The seed dataset is **4.8.2-LIVE.12030094**, displayed as baseline patch **4.8.2**.
- Ships, ground vehicles, blueprints and blueprint materials import from the Star Citizen Wiki API.
- The official RSI LIVE patch and each third-party source advance independently.
- The Game Data Library and LIVE verification controls are Admin-only.
- The missing \`material_name\` campaign column is repaired.
- Discord OAuth linking and webhooks are installed but switched off by default.
- Discord secrets are stored only in Netlify environment variables.
- This project is still in setup/testing, so imported test data may be reset from the Admin game-data page.

See \`PATCH-README.md\` and \`NETLIFY-ENVIRONMENT.md\` for deployment steps.
`);
}

function patchRedeploy() {
  appendSection("REDEPLOY.md", "## 4.8.2 test-phase deployment", `
## 4.8.2 test-phase deployment

This portal is still in setup/testing and contains no production data that needs preserving. Apply the overlay directly to GitHub, run the patch script, commit and push. Netlify should remain the only host, Functions platform, Identity provider and database platform.

New migrations:

\`\`\`text
netlify/database/migrations/0006_live_patch_baseline_and_catalog.sql
netlify/database/migrations/0007_discord_integrations.sql
\`\`\`

After deployment, open **Admin → Game Data & LIVE Verification** and import the 4.8.2 baseline. Use **Reset imported test data** whenever a clean import is needed during testing.

Discord remains off until the variables in \`NETLIFY-ENVIRONMENT.md\` are added and the Admin tickboxes are enabled.
`);
}

function patchValidation() {
  const file = "VALIDATION.md";
  if (!exists(file)) return;
  let content = read(file).replace(
    /Discord webhooks, OAuth, bots and automatic posting are absent and server-disabled/g,
    "Discord OAuth and webhook code is present, server-protected and disabled by default until Netlify variables are configured"
  );
  write(file, content);
}

function patchEnvExample() {
  const file = ".env.example";
  const marker = "# FREE NAVY 4.8.2 LIVE PATCH";
  const block = `${marker}\nSTAR_CITIZEN_BASELINE_VERSION=4.8.2-LIVE.12030094\nSCW_API_BASE=https://api.star-citizen.wiki/api\nRSI_LIVE_PATCH_URL=\nUEX_CLIENT_VERSION=free-navy-4.8.2-live-sync\nDISCORD_CLIENT_ID=\nDISCORD_CLIENT_SECRET=\nDISCORD_REDIRECT_URI=https://YOUR-SITE.netlify.app/api/discord-auth-callback\nDISCORD_GUILD_ID=\nDISCORD_BOT_TOKEN=\nDISCORD_WEBHOOK_URL=\n`;
  const current = exists(file) ? read(file) : "";
  if (!current.includes(marker)) write(file, `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}`);
}

patchConfig();
patchIndex();
patchStyles();
patchPackage();
patchReadme();
patchRedeploy();
patchValidation();
patchEnvExample();

console.log("Free Navy GitHub + Netlify patch applied: 4.8.2 baseline, Admin LIVE data and optional Discord integration.");
