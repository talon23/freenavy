import { db } from "./data.js";
import { navItems, pageMeta, renderPage, setLivePatch } from "./pages.js";
import { $, escapeHtml, initials, rankLabel, appointmentLabels, toast } from "./utils.js";

const config = window.FREE_NAVY_CONFIG || {};
let currentPage = "dashboard";
let currentContext = {};
let profile = null;
let portalSettingsLoaded = false;

async function loadPortalSettings() {
  if (portalSettingsLoaded || db.mode === "demo") return;
  try {
    const [backgrounds, content, featureFlags, siteSettings] = await Promise.all([
      db.list("page_backgrounds", { order: "page_id", ascending: true }),
      db.list("page_content", { order: "page_id", ascending: true }),
      db.list("feature_flags", { order: "feature_key", ascending: true }).catch(() => []),
      db.list("site_settings", { order: "setting_key", ascending: true }).catch(() => [])
    ]);
    config.pageBackgrounds ||= {};
    config.backgroundPosition ||= {};
    config.backgroundOverlay ||= {};
    for (const row of backgrounds) {
      config.pageBackgrounds[row.page_id] = row.asset_path;
      config.backgroundPosition[row.page_id] = row.position || "center";
      config.backgroundOverlay[row.page_id] = Number(row.overlay_strength ?? 0.78);
    }
    config.managedPageContent = content;
    config.featureFlags = Object.fromEntries(featureFlags.map((row) => [row.feature_key, row.enabled !== false]));
    config.siteSettings = Object.fromEntries(siteSettings.map((row) => [row.setting_key, row.setting_value]));
    portalSettingsLoaded = true;
  } catch (error) {
    console.warn("Portal-managed settings could not be loaded; local defaults remain active.", error);
  }
}

function applyPageBackground(pageId = "public") {
  const backgrounds = config.pageBackgrounds || {};
  const source = backgrounds[pageId] || backgrounds.dashboard || backgrounds.public || "/assets/backgrounds/public-home.svg";
  const position = config.backgroundPosition?.[pageId] || config.backgroundPosition?.default || "center";
  document.documentElement.style.setProperty("--page-background", `url("${source}")`);
  const overlay = Number(config.backgroundOverlay?.[pageId] ?? config.backgroundOverlay?.default ?? 0.78);
  document.documentElement.style.setProperty("--page-background-position", position);
  document.documentElement.style.setProperty("--page-overlay-strength", String(Math.min(1, Math.max(0, overlay))));
  $("#portal-shell")?.setAttribute("data-page", pageId);
  $("#public-shell")?.setAttribute("data-page", pageId === "public" ? "public" : "");
}

function setConnection(label, tone = "") {
  const node = $("#connection-status");
  node.textContent = label;
  node.className = `status-pill ${tone}`.trim();
}

function showPublic() {
  applyPageBackground("public");
  $("#public-shell").classList.remove("hidden");
  $("#portal-shell").classList.add("hidden");
  $("#login-panel").classList.add("hidden");
}
function showLogin(mode = "login") {
  const loginForm = $("#login-form");
  const inviteForm = $("#invite-accept-form");
  const recoveryForm = $("#recovery-form");
  loginForm.classList.toggle("hidden", mode !== "login");
  inviteForm.classList.toggle("hidden", mode !== "invite");
  recoveryForm.classList.toggle("hidden", mode !== "recovery");
  $("#forgot-password").classList.toggle("hidden", mode !== "login");
  $("#login-note").textContent = mode === "invite" ? "This invitation is tied to your email address and can only be used once." : mode === "recovery" ? "After the password is changed, your existing organisation access remains in place." : "Accounts are invitation-only. Access is removed when a membership is disabled.";
  $("#login-title").textContent = mode === "invite" ? "Activate Free Navy account" : mode === "recovery" ? "Recover your account" : "Command network login";
  $("#login-panel").classList.remove("hidden");
  window.setTimeout(() => $(mode === "invite" ? "#invite-password" : mode === "recovery" ? "#recovery-password" : "#login-email")?.focus(), 80);
}
function showJoin(token) {
  showPublic();
  $("#join-token").value = token || "";
  $("#join-result").classList.add("hidden");
  $("#join-form").classList.remove("hidden");
  $("#join-panel").classList.remove("hidden");
  window.setTimeout(() => $("#join-display-name")?.focus(), 80);
}

function navAllowed(item) {
  if (item.capability && !profile?.capabilities?.[item.capability]) return false;
  if (item.ranks && !item.ranks.includes(profile?.rank)) return false;
  if (item.feature && config.featureFlags?.[item.feature] === false) return false;
  return true;
}
function buildNavigation() {
  const nav = $("#main-nav");
  nav.innerHTML = navItems.filter(navAllowed).map((item) => {
    if (item.section) return `<div class="nav-section">${escapeHtml(item.section)}</div>`;
    return `<button class="nav-button ${item.id === currentPage ? "active" : ""}" data-page="${item.id}"><span class="nav-icon">${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)}</span>${item.restricted ? '<span class="admin-tag">LOCKED</span>' : ""}</button>`;
  }).join("");
  nav.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
}

async function updateNotificationCount() {
  if (!profile) return;
  try {
    const rows = await db.list("notifications", { order: null });
    const count = rows.filter((n) => n.member_id === profile.id && !n.read_at).length;
    const badge = $("#notification-count");
    badge.textContent = count;
    badge.classList.toggle("hidden", !count);
  } catch { /* notifications table may not yet exist during setup */ }
}

async function updateLivePatchBadge() {
  const badge = $("#live-patch-badge");
  const result = await db.liveVersion();
  const isLive = String(result.environment).toUpperCase() === "LIVE";
  const validVersion = /^\d+(?:\.[0-9A-Za-z]+){1,3}$/.test(String(result.version || ""));
  if (isLive && validVersion) {
    config.livePatch = String(result.version);
    setLivePatch(result.version);
  }
  const matches = isLive && validVersion;
  badge.textContent = `${result.environment || "LIVE"} ${result.version || config.livePatch}`;
  badge.className = `status-pill ${matches ? "live" : "demo"}`;
  badge.title = matches ? "Operational records are gated to the detected official LIVE patch." : "The official LIVE version could not be verified; the configured fallback is active.";
}

async function navigate(pageId, context = {}) {
  if (!pageMeta[pageId]) pageId = "dashboard";
  const navItem = navItems.find((item) => item.id === pageId);
  if (navItem && !navAllowed(navItem)) pageId = "dashboard";
  currentPage = pageId;
  currentContext = context;
  applyPageBackground(pageId);
  buildNavigation();
  const [title, kicker] = pageMeta[pageId];
  $("#page-title").textContent = title;
  $("#page-kicker").textContent = kicker;
  $("#sidebar").classList.remove("open");
  const hash = pageId === "search" && context.query ? `search?q=${encodeURIComponent(context.query)}` : pageId;
  if (window.location.hash.replace(/^#/, "") !== hash) history.replaceState(null, "", `#${hash}`);
  setConnection(db.mode === "demo" ? "Sample portal" : "Secure session", db.mode === "demo" ? "demo" : "live");
  await renderPage(pageId, profile, context);
  await updateNotificationCount();
  $("#page-content").focus({ preventScroll: true });
}

function routeFromHash() {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return { page: "dashboard", context: {} };
  const [page, queryString] = raw.split("?");
  const params = new URLSearchParams(queryString || "");
  return { page: pageMeta[page] ? page : "dashboard", context: { query: params.get("q") || "" } };
}

async function enterPortal(userProfile) {
  profile = userProfile;
  $("#public-shell").classList.add("hidden");
  $("#login-panel").classList.add("hidden");
  $("#portal-shell").classList.remove("hidden");
  $("#user-name").textContent = profile.display_name || profile.rsi_handle || "Member";
  const appointments = appointmentLabels(profile);
  $("#user-role").textContent = `${rankLabel(profile.rank)}${appointments.length ? ` · ${appointments.join(" · ")}` : ""}`;
  $("#user-avatar").textContent = initials(profile.display_name || profile.rsi_handle);
  await loadPortalSettings();
  await updateLivePatchBadge();
  const route = routeFromHash();
  await navigate(route.page, route.context);
}

async function initialise() {
  document.body.classList.toggle("command-mode", localStorage.getItem("free-navy-command-mode") === "1");
  const setupMessage = $("#setup-message");
  const demoButton = $("#preview-demo");
  const joinToken = new URLSearchParams(window.location.search).get("join") || "";
  if (!db.configured) {
    setupMessage.innerHTML = "The secure database has not been connected yet. The sample portal stores data only in this browser and is for layout testing, not real member use.";
    setupMessage.classList.remove("hidden");
    if (config.allowSamplePreviewWhenUnconfigured) demoButton.classList.remove("hidden");
  }
  try {
    const session = await db.initialise();
    if (session.pendingInvite) { showPublic(); showLogin("invite"); }
    else if (session.pendingRecovery) { showPublic(); showLogin("recovery"); }
    else if (session.profile) await enterPortal(session.profile);
    else if (joinToken) showJoin(joinToken);
    else showPublic();
  } catch (error) { showPublic(); if (joinToken) showJoin(joinToken); toast(error.message, "error", 6000); }
}

$("#open-login").addEventListener("click", () => showLogin("login"));
$("#hero-login").addEventListener("click", () => showLogin("login"));
$("#close-login").addEventListener("click", () => $("#login-panel").classList.add("hidden"));
$("#login-panel").addEventListener("click", (event) => { if (event.target.id === "login-panel") $("#login-panel").classList.add("hidden"); });
$("#preview-demo").addEventListener("click", async () => { try { await enterPortal(await db.enterDemo()); } catch (error) { toast(error.message, "error"); } });
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const button = event.submitter; const original = button.textContent; button.disabled = true; button.textContent = "Authenticating…";
  try { await enterPortal(await db.login($("#login-email").value.trim(), $("#login-password").value)); }
  catch (error) { toast(error.message, "error", 6000); }
  finally { button.disabled = false; button.textContent = original; }
});

$("#invite-accept-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#invite-password").value;
  if (password !== $("#invite-password-confirm").value) return toast("The passwords do not match.", "warning");
  const button = event.submitter; const original = button.textContent; button.disabled = true; button.textContent = "Activating…";
  try { await enterPortal(await db.completeInvite(password)); toast("Account activated.", "success"); }
  catch (error) { toast(error.message, "error", 6000); }
  finally { button.disabled = false; button.textContent = original; }
});
$("#recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#recovery-password").value;
  if (password !== $("#recovery-password-confirm").value) return toast("The passwords do not match.", "warning");
  const button = event.submitter; const original = button.textContent; button.disabled = true; button.textContent = "Updating…";
  try { await enterPortal(await db.completeRecovery(password)); toast("Password updated.", "success"); }
  catch (error) { toast(error.message, "error", 6000); }
  finally { button.disabled = false; button.textContent = original; }
});

$("#close-join").addEventListener("click", () => $("#join-panel").classList.add("hidden"));
$("#join-panel").addEventListener("click", (event) => { if (event.target.id === "join-panel") $("#join-panel").classList.add("hidden"); });
$("#join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter; const original = button.textContent; button.disabled = true; button.textContent = "Sending…";
  try {
    const result = await db.submitMembershipApplication({
      token: $("#join-token").value,
      display_name: $("#join-display-name").value.trim(),
      rsi_handle: $("#join-rsi-handle").value.trim(),
      discord_handle: $("#join-discord-handle").value.trim(),
      referrer_name: $("#join-referrer").value.trim(),
      requested_department: $("#join-department").value,
      email: $("#join-email").value.trim(),
      message: $("#join-message").value.trim(),
      website: $("#join-website").value
    });
    $("#join-form").classList.add("hidden");
    const note = $("#join-result"); note.textContent = result.message || "Application submitted for command review."; note.classList.remove("hidden");
  } catch (error) { toast(error.message, "error", 6000); }
  finally { button.disabled = false; button.textContent = original; }
});

$("#forgot-password").addEventListener("click", async () => { const email = $("#login-email").value.trim(); if (!email) return toast("Enter your account email first.", "warning"); try { await db.resetPassword(email); toast("Password reset email sent.", "success"); } catch (error) { toast(error.message, "error"); } });
$("#logout-button").addEventListener("click", async () => { await db.logout(); profile = null; history.replaceState(null, "", window.location.pathname); showPublic(); });
$("#refresh-page").addEventListener("click", () => navigate(currentPage, currentContext));
$("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#notifications-button").addEventListener("click", () => navigate("notifications"));
$("#mobile-command-toggle").addEventListener("click", () => {
  const enabled = document.body.classList.toggle("command-mode");
  localStorage.setItem("free-navy-command-mode", enabled ? "1" : "0");
  toast(enabled ? "Compact in-game mode enabled." : "Full portal mode restored.", "success");
});
$("#global-search-form").addEventListener("submit", (event) => { event.preventDefault(); const query = $("#global-search-input").value.trim(); if (query) navigate("search", { query }); });
window.addEventListener("free-navy:navigate", (event) => navigate(event.detail));
window.addEventListener("free-navy:search", (event) => navigate("search", { query: event.detail }));
window.addEventListener("free-navy:notifications-changed", updateNotificationCount);
window.addEventListener("free-navy:feature-flags-changed", (event) => {
  const { featureKey, enabled } = event.detail || {};
  if (featureKey) config.featureFlags = { ...(config.featureFlags || {}), [featureKey]: enabled !== false };
  const currentItem = navItems.find((item) => item.id === currentPage);
  if (currentItem && !navAllowed(currentItem)) navigate("dashboard");
  else buildNavigation();
});
window.addEventListener("hashchange", () => { if (!profile) return; const route = routeFromHash(); if (route.page !== currentPage || route.context.query !== currentContext.query) navigate(route.page, route.context); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { $("#login-panel").classList.add("hidden"); $("#join-panel").classList.add("hidden"); $("#app-modal").classList.add("hidden"); } });

initialise();
