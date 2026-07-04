const API = window.FREE_NAVY_CONFIG?.gameDataAdminPath || "/api/game-data-admin";
const BACKGROUND_API = window.FREE_NAVY_CONFIG?.gameDataBackgroundPath || "/api/game-data-sync-background";
const ADMIN_PAGE_ID = "admin-live-data";
let accessChecked = false;
let hasAccess = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
}

async function api(action, payload = {}) {
  const response = await fetch(API, {
    method: action ? "POST" : "GET",
    headers: action ? { "content-type": "application/json" } : {},
    body: action ? JSON.stringify({ action, ...payload }) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { status: response.status });
  return data;
}


async function queueBaselineImport() {
  const response = await fetch(BACKGROUND_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categories: ["ship", "blueprint"] }),
  });
  if (!response.ok && response.status !== 202) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Unable to queue import: ${response.status}`);
  }
  return { queued: true };
}

async function pollImport(page, attempts = 0) {
  if (!document.body.contains(page) || attempts > 60) return;
  try {
    const summary = await api();
    const source = (summary.sources || []).find((entry) => entry.source_key === "star-citizen-wiki");
    const status = page.querySelector("#live-data-action-status");
    if (!status) return;
    if (source?.status === "ok" || source?.status === "error") {
      page.innerHTML = summaryMarkup(summary);
      bindActions(page, summary);
      const refreshed = page.querySelector("#live-data-action-status");
      refreshed.classList.remove("hidden");
      refreshed.classList.toggle("error", source.status === "error");
      refreshed.textContent = source.status === "ok"
        ? `Import complete: ${Number(source.records_published || 0)} records published.`
        : `Import failed: ${source.last_error || "Unknown error"}`;
      return;
    }
    status.textContent = `Import running… ${Number(source?.records_published || 0)} records published so far.`;
  } catch (error) {
    console.warn("Import status poll failed", error);
  }
  setTimeout(() => pollImport(page, attempts + 1), 5000);
}
function removeMemberLinks() {
  for (const selector of [
    '[data-page="verification"]', '[data-route="verification"]', '[href="#verification"]',
    '[data-page="catalog"]', '[data-route="catalog"]', '[href="#catalog"]',
  ]) {
    document.querySelectorAll(selector).forEach((element) => element.remove());
  }
}

function findAdminContainer() {
  return document.querySelector('[data-nav-group="admin"]')
    || document.querySelector(".sidebar nav")
    || document.querySelector(".sidebar")
    || document.querySelector("#sidebar");
}

function installAdminLink() {
  if (!hasAccess || document.querySelector(`[data-page="${ADMIN_PAGE_ID}"]`)) return;
  const container = findAdminContainer();
  if (!container) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-button admin-live-data-link";
  button.dataset.page = ADMIN_PAGE_ID;
  button.innerHTML = '<span aria-hidden="true">⌁</span><span>Game Data &amp; LIVE Verification</span>';
  button.addEventListener("click", renderAdminPage);
  container.append(button);
}

function statusPill(status) {
  const safe = escapeHtml(status || "unknown");
  return `<span class="status-pill ${safe === "ok" ? "live" : ""}">${safe}</span>`;
}

function summaryMarkup(summary) {
  const state = summary.patchState || {};
  const counts = summary.counts || [];
  const sources = summary.sources || [];
  const campaigns = summary.campaigns || [];
  return `
    <section class="page-hero compact">
      <div><p class="eyebrow">ADMIN ONLY</p><h2>Game Data &amp; LIVE Verification</h2>
      <p class="page-subtitle">4.8.2 is the seed dataset. RSI LIVE and each third-party source can advance independently.</p></div>
    </section>
    <div class="grid cols-3">
      <article class="card"><p class="eyebrow">BASELINE</p><h3>${escapeHtml(state.baseline_patch || "4.8.2")}</h3><p>${escapeHtml(state.baseline_source_version || "4.8.2-LIVE.12030094")}</p></article>
      <article class="card"><p class="eyebrow">RSI LIVE</p><h3>${escapeHtml(state.official_live_patch || "Not checked")}</h3><p>${escapeHtml(state.last_official_check_at || "No successful check yet")}</p></article>
      <article class="card"><p class="eyebrow">CURRENT CATALOG</p><h3>${counts.reduce((total, row) => total + Number(row.count || 0), 0)}</h3><p>Ships, vehicles and blueprints</p></article>
    </div>
    <article class="card">
      <div class="section-header"><div><h3>Controls</h3><p>All actions are enforced server-side for authorised command and game-data import accounts.</p></div></div>
      <div class="button-row">
        <button class="button primary" data-live-action="sync-baseline">Import 4.8.2 ships &amp; blueprints</button>
        <button class="button" data-live-action="check-live">Check RSI LIVE patch</button>
        <button class="button" data-live-action="create-campaign">Create verification campaign</button>
        <button class="button danger" data-live-action="reset-test-data">Reset imported test data</button>
      </div>
      <p id="live-data-action-status" class="notice hidden"></p>
    </article>
    <article class="card"><h3>Third-party coverage</h3>
      <div class="table-wrap"><table><thead><tr><th>Source</th><th>Version</th><th>Ships</th><th>Vehicles</th><th>Blueprints</th><th>Status</th><th>Last success</th></tr></thead><tbody>
      ${sources.map((source) => `<tr><td>${escapeHtml(source.display_name)}</td><td>${escapeHtml(source.source_version || source.source_patch || "-")}</td><td>${Number(source.ships_received || 0)}</td><td>${Number(source.vehicles_received || 0)}</td><td>${Number(source.blueprints_received || 0)}</td><td>${statusPill(source.status)}</td><td>${escapeHtml(source.last_success_at || "-")}</td></tr>`).join("") || '<tr><td colspan="7">No source run recorded.</td></tr>'}
      </tbody></table></div>
    </article>
    <article class="card"><h3>Current data by patch</h3>
      <div class="table-wrap"><table><thead><tr><th>Category</th><th>Patch</th><th>Records</th></tr></thead><tbody>
      ${counts.map((row) => `<tr><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.patch_version)}</td><td>${Number(row.count || 0)}</td></tr>`).join("") || '<tr><td colspan="3">No imported records yet.</td></tr>'}
      </tbody></table></div>
    </article>
    <article class="card"><h3>Verification campaigns</h3>
      <div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>
      ${campaigns.map((campaign) => `<tr><td>${escapeHtml(campaign.title)}</td><td>${escapeHtml(campaign.status)}</td><td>${Number(campaign.completed_count || 0)} / ${Number(campaign.task_count || 0)}</td><td>${escapeHtml(campaign.created_at)}</td></tr>`).join("") || '<tr><td colspan="4">No campaigns.</td></tr>'}
      </tbody></table></div>
    </article>`;
}

async function renderAdminPage() {
  const page = document.querySelector("#page-content");
  if (!page) return;
  page.innerHTML = '<div class="card"><h2>Loading game data controls…</h2></div>';
  const title = document.querySelector("#page-title");
  if (title) title.textContent = "Game Data & LIVE Verification";
  try {
    const summary = await api();
    page.innerHTML = summaryMarkup(summary);
    bindActions(page, summary);
  } catch (error) {
    page.innerHTML = `<div class="notice error"><strong>Unable to open admin game data.</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function bindActions(page, summary) {
  page.querySelectorAll("[data-live-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.liveAction;
      const status = page.querySelector("#live-data-action-status");
      let payload = {};

      if (action === "create-campaign") {
        const suggested = summary.patchState?.official_live_patch || "4.8.3";
        const targetPatch = window.prompt("Target LIVE patch", suggested);
        if (!targetPatch) return;
        payload = { targetPatch };
      }

      if (action === "reset-test-data") {
        const accepted = window.confirm("This clears imported ships, blueprints and verification campaigns. Continue?");
        if (!accepted) return;
        payload = { confirmation: "RESET 4.8.2 DATA" };
      }

      page.querySelectorAll("[data-live-action]").forEach((control) => { control.disabled = true; });
      status.classList.remove("hidden", "error");
      status.textContent = "Running…";
      try {
        if (action === "sync-baseline") {
          await queueBaselineImport();
          status.textContent = "4.8.2 import queued in a Netlify Background Function. This page will update automatically.";
          page.querySelectorAll("[data-live-action]").forEach((control) => { control.disabled = false; });
          setTimeout(() => pollImport(page), 2500);
          return;
        }
        const result = await api(action, payload);
        page.innerHTML = summaryMarkup(result.summary);
        const refreshedStatus = page.querySelector("#live-data-action-status");
        refreshedStatus.classList.remove("hidden");
        refreshedStatus.textContent = JSON.stringify(result.result, null, 2);
        bindActions(page, result.summary);
      } catch (error) {
        status.classList.add("error");
        status.textContent = error.message;
        page.querySelectorAll("[data-live-action]").forEach((control) => { control.disabled = false; });
      }
    });
  });
}

async function checkAccess() {
  if (accessChecked) return;
  accessChecked = true;
  try {
    await api();
    hasAccess = true;
    installAdminLink();
  } catch (error) {
    hasAccess = false;
    if (![401, 403].includes(error.status)) console.warn("Admin game data availability check failed", error);
  }
}

const observer = new MutationObserver(() => {
  removeMemberLinks();
  installAdminLink();
});

window.addEventListener("DOMContentLoaded", () => {
  removeMemberLinks();
  checkAccess();
  observer.observe(document.body, { childList: true, subtree: true });
});
