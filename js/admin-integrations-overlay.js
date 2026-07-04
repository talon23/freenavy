const DISCORD_ADMIN_API = window.FREE_NAVY_CONFIG?.discordAdminPath || "/api/discord-admin";
const DISCORD_LINK_API = window.FREE_NAVY_CONFIG?.discordLinkStatusPath || "/api/discord-link-status";
const INTEGRATIONS_PAGE_ID = "admin-integrations";

let adminStatus = null;
let adminAccessChecked = false;
let memberStatus = null;
let lastMemberCheck = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed: ${response.status}`), { status: response.status });
  return data;
}

function adminApi(action, payload = {}) {
  return jsonRequest(DISCORD_ADMIN_API, action ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  } : {});
}

function findNavContainer() {
  return document.querySelector('[data-nav-group="admin"]')
    || document.querySelector(".sidebar nav")
    || document.querySelector("#main-nav")
    || document.querySelector("#sidebar");
}

function showToast(message, tone = "success") {
  const region = document.querySelector("#toast-region") || document.body;
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "error" ? "error" : ""}`;
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 6500);
}

function processDiscordReturn() {
  const url = new URL(window.location.href);
  const status = url.searchParams.get("discord");
  if (!status) return;
  if (status === "linked") showToast("Discord account linked successfully.");
  if (status === "error") showToast(url.searchParams.get("discord_message") || "Discord verification failed.", "error");
  url.searchParams.delete("discord");
  url.searchParams.delete("discord_message");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function installAdminLink() {
  if (!adminStatus || document.querySelector(`[data-page="${INTEGRATIONS_PAGE_ID}"]`)) return;
  const container = findNavContainer();
  if (!container) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nav-button admin-integrations-link";
  button.dataset.page = INTEGRATIONS_PAGE_ID;
  button.innerHTML = '<span aria-hidden="true">◫</span><span>Discord Integrations</span>';
  button.addEventListener("click", renderIntegrationsPage);
  container.append(button);
}

function installMemberLink() {
  const existing = document.querySelector('[data-page="discord-connect"]');
  if (!memberStatus?.enabled) {
    existing?.remove();
    return;
  }
  if (existing) {
    const label = existing.querySelector("span:last-child");
    if (label) label.textContent = memberStatus.linked ? `Discord: ${memberStatus.linked.discord_username}` : "Connect Discord";
    existing.classList.toggle("fn-discord-linked", Boolean(memberStatus.linked));
    return;
  }

  const container = document.querySelector("#main-nav") || document.querySelector(".sidebar nav");
  if (!container) return;
  const link = document.createElement("a");
  link.className = `nav-item${memberStatus.linked ? " fn-discord-linked" : ""}`;
  link.dataset.page = "discord-connect";
  link.href = "/api/discord-auth-start";
  link.innerHTML = `<span aria-hidden="true">◉</span><span>${memberStatus.linked ? `Discord: ${escapeHtml(memberStatus.linked.discord_username)}` : "Connect Discord"}</span>`;
  link.title = memberStatus.linked ? "Re-verify or change the linked Discord account" : "Link and verify your Discord account";
  container.append(link);
}

function readinessText(ready, missing) {
  return ready ? "Ready" : `Setup required: ${missing.join(", ")}`;
}

function statusBadge(enabled, ready) {
  if (enabled) return '<span class="fn-feature-status status-pill live">Enabled</span>';
  if (!ready) return '<span class="fn-feature-status status-pill">Setup required</span>';
  return '<span class="fn-feature-status status-pill">Disabled</span>';
}

function updateFeatureCard(card, type) {
  if (!adminStatus) return;
  card.classList.add("fn-discord-feature");
  card.classList.remove("locked");

  const settings = adminStatus.settings || {};
  const environment = adminStatus.environment || {};
  const isAccount = type === "account";
  const enabled = isAccount ? settings.account_verification_enabled : settings.webhook_posting_enabled;
  const ready = isAccount ? environment.accountVerificationReady : environment.webhookReady;
  const missing = isAccount ? environment.missingAccountVariables : environment.missingWebhookVariables;

  card.querySelectorAll(".status-pill, .fn-feature-status").forEach((node) => node.remove());
  card.insertAdjacentHTML("beforeend", statusBadge(enabled, ready));

  const description = card.querySelector("p");
  if (description) {
    description.textContent = isAccount
      ? "Members can link their Discord identity after the Netlify OAuth variables are configured."
      : "Automated Discord posting stays off until the Netlify webhook variable is configured.";
  }

  let checkbox = card.querySelector('input[type="checkbox"]');
  if (!checkbox) return;
  if (!checkbox.dataset.fnDiscordControlled) {
    const replacement = checkbox.cloneNode(true);
    checkbox.replaceWith(replacement);
    checkbox = replacement;
    checkbox.dataset.fnDiscordControlled = type;
    checkbox.addEventListener("change", async (event) => {
      event.stopImmediatePropagation();
      const desired = checkbox.checked;
      checkbox.disabled = true;
      try {
        const current = adminStatus.settings || {};
        adminStatus = await adminApi("save", {
          accountVerificationEnabled: isAccount ? desired : current.account_verification_enabled,
          webhookPostingEnabled: isAccount ? current.webhook_posting_enabled : desired,
          requireGuildMembership: current.require_guild_membership,
        });
        showToast(`${isAccount ? "Discord verification" : "Discord webhooks"} ${desired ? "enabled" : "disabled"}.`);
        refreshDiscordFeatureCards();
        await refreshMemberStatus(true);
      } catch (error) {
        checkbox.checked = !desired;
        showToast(error.message, "error");
        checkbox.disabled = false;
      }
    }, true);
  }

  checkbox.checked = Boolean(enabled);
  checkbox.disabled = !ready && !enabled;
  checkbox.title = ready ? "" : readinessText(false, missing);
}

function refreshDiscordFeatureCards() {
  if (!adminStatus) return;
  document.querySelectorAll(".feature-switch").forEach((card) => {
    const title = (card.querySelector("h4, h3, strong")?.textContent || card.textContent || "").toLowerCase();
    if (title.includes("discord account") || title.includes("discord verification")) updateFeatureCard(card, "account");
    if (title.includes("discord webhook")) updateFeatureCard(card, "webhook");
  });
}

function integrationMarkup(status) {
  const settings = status.settings || {};
  const environment = status.environment || {};
  const variableRows = Object.entries(environment.variables || {}).map(([name, present]) => `
    <div class="fn-env-row"><code>${escapeHtml(name)}</code><strong class="${present ? "fn-discord-linked" : ""}">${present ? "Configured" : "Missing"}</strong></div>
  `).join("");

  return `
    <section class="page-hero compact">
      <div><p class="eyebrow">ADMIN ONLY</p><h2>Discord Integrations</h2>
      <p class="page-subtitle">Discord code is installed but switched off by default. Secrets remain in Netlify, never in GitHub or the portal database.</p></div>
    </section>
    <div class="fn-integration-grid">
      <article class="card">
        <h3>Runtime switches</h3>
        <label class="fn-integration-toggle">
          <input id="fn-discord-verification-enabled" type="checkbox" ${settings.account_verification_enabled ? "checked" : ""} ${!environment.accountVerificationReady && !settings.account_verification_enabled ? "disabled" : ""} />
          <span><strong>Discord account verification</strong><small>${escapeHtml(readinessText(environment.accountVerificationReady, environment.missingAccountVariables || []))}</small></span>
        </label>
        <label class="fn-integration-toggle">
          <input id="fn-discord-webhooks-enabled" type="checkbox" ${settings.webhook_posting_enabled ? "checked" : ""} ${!environment.webhookReady && !settings.webhook_posting_enabled ? "disabled" : ""} />
          <span><strong>Discord webhook posting</strong><small>${escapeHtml(readinessText(environment.webhookReady, environment.missingWebhookVariables || []))}</small></span>
        </label>
        <label class="fn-integration-toggle">
          <input id="fn-discord-guild-required" type="checkbox" ${settings.require_guild_membership ? "checked" : ""} ${!environment.guildCheckReady && !settings.require_guild_membership ? "disabled" : ""} />
          <span><strong>Require Free Navy server membership</strong><small>${escapeHtml(readinessText(environment.guildCheckReady, environment.missingGuildVariables || []))}</small></span>
        </label>
        <div class="button-row">
          <button id="fn-save-discord" class="button primary">Save Discord switches</button>
          <button id="fn-test-discord-webhook" class="button" ${!settings.webhook_posting_enabled || !environment.webhookReady ? "disabled" : ""}>Send test webhook</button>
        </div>
        <p id="fn-discord-result" class="notice hidden"></p>
      </article>
      <article class="card">
        <h3>Netlify environment setup</h3>
        <p>Add these under <strong>Netlify → Project configuration → Environment variables</strong>. Do not commit their values to GitHub.</p>
        <div class="fn-env-list">${variableRows}</div>
        <p class="table-subtext"><strong>DISCORD_REDIRECT_URI</strong> must be your site URL followed by <code>/api/discord-auth-callback</code>.</p>
      </article>
      <article class="card">
        <p class="eyebrow">LINKED ACCOUNTS</p>
        <h3>${Number(status.linkedAccounts || 0)}</h3>
        <p>Verified portal accounts currently linked to Discord.</p>
      </article>
    </div>`;
}

async function renderIntegrationsPage() {
  const page = document.querySelector("#page-content");
  if (!page) return;
  const title = document.querySelector("#page-title");
  if (title) title.textContent = "Discord Integrations";
  page.innerHTML = '<article class="card"><h2>Loading Discord controls…</h2></article>';
  try {
    adminStatus = await adminApi();
    page.innerHTML = integrationMarkup(adminStatus);
    bindIntegrationActions(page);
  } catch (error) {
    page.innerHTML = `<div class="notice error"><strong>Unable to open Discord integrations.</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function bindIntegrationActions(page) {
  const result = page.querySelector("#fn-discord-result");
  page.querySelector("#fn-save-discord")?.addEventListener("click", async () => {
    result.classList.remove("hidden", "error");
    result.textContent = "Saving…";
    try {
      adminStatus = await adminApi("save", {
        accountVerificationEnabled: page.querySelector("#fn-discord-verification-enabled").checked,
        webhookPostingEnabled: page.querySelector("#fn-discord-webhooks-enabled").checked,
        requireGuildMembership: page.querySelector("#fn-discord-guild-required").checked,
      });
      result.textContent = "Discord settings saved.";
      page.innerHTML = integrationMarkup(adminStatus);
      bindIntegrationActions(page);
      refreshDiscordFeatureCards();
      await refreshMemberStatus(true);
    } catch (error) {
      result.classList.add("error");
      result.textContent = error.message;
    }
  });

  page.querySelector("#fn-test-discord-webhook")?.addEventListener("click", async () => {
    result.classList.remove("hidden", "error");
    result.textContent = "Sending test message…";
    try {
      const response = await adminApi("test-webhook");
      adminStatus = response;
      result.textContent = "Discord test webhook sent.";
    } catch (error) {
      result.classList.add("error");
      result.textContent = error.message;
    }
  });
}

async function checkAdminAccess() {
  if (adminAccessChecked) return;
  adminAccessChecked = true;
  try {
    adminStatus = await adminApi();
    installAdminLink();
    refreshDiscordFeatureCards();
  } catch (error) {
    if (![401, 403].includes(error.status)) console.warn("Discord admin status failed", error);
  }
}

async function refreshMemberStatus(force = false) {
  const now = Date.now();
  if (!force && now - lastMemberCheck < 4000) return;
  lastMemberCheck = now;
  try {
    memberStatus = await jsonRequest(DISCORD_LINK_API);
    installMemberLink();
  } catch (error) {
    if (![401, 403].includes(error.status)) console.warn("Discord link status failed", error);
  }
}

const observer = new MutationObserver(() => {
  installAdminLink();
  installMemberLink();
  refreshDiscordFeatureCards();
  if (document.querySelector("#portal-shell:not(.hidden)")) refreshMemberStatus();
});

window.addEventListener("DOMContentLoaded", () => {
  processDiscordReturn();
  checkAdminAccess();
  refreshMemberStatus();
  observer.observe(document.body, { childList: true, subtree: true });
});
