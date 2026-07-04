export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

export function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits }).format(Number(value || 0));
}

export function formatCredits(value) {
  return `${formatNumber(value)} aUEC`;
}

export function formatDate(value, withTime = true) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {})
  }).format(date);
}

export function initials(value = "Free Navy") {
  return String(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function roleLabel(role = "enlisted") {
  return String(role || "enlisted").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const rankLabel = roleLabel;

export function appointmentLabels(profile) {
  return Array.isArray(profile?.roles) ? profile.roles.map(roleLabel) : [];
}

export function isAdmin(profile) {
  return Boolean(profile?.capabilities?.manage_site || profile?.roles?.includes("admin") || ["president","vice_president"].includes(profile?.rank));
}

export function isOfficerUp(profile) {
  if (profile?.capabilities) return Boolean(profile.capabilities.officer_up);
  return ["president","vice_president","general","admiral","vice_admiral","rear_admiral","brigadier_general","officer"].includes(profile?.rank);
}

export function canManage(profile, area = "all") {
  const caps = profile?.capabilities || {};
  const map = {
    warehouse: "manage_warehouse", workorders: "officer_up", crafting: "edit_game_data", refinery: "manage_warehouse",
    knowledge: "edit_game_data", mining: "edit_game_data", salvaging: "edit_game_data", operations: "officer_up",
    crew: "officer_up", fleet: "officer_up", rescue: "officer_up", exploration: "officer_up", intel: "officer_up",
    incidents: "officer_up", training: "officer_up", kits: "manage_warehouse", wikelo: "officer_up",
    auctions: "manage_treasury", treasury: "manage_treasury", members: "manage_members", sync: "edit_game_data",
    admin: "manage_site", flags: "edit_game_data", catalog: "edit_game_data", backup: "manage_site"
  };
  if (area === "all") return Boolean(caps.manage_site);
  return Boolean(caps[map[area]]);
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function toast(message, type = "info", duration = 3600) {
  const region = $("#toast-region");
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  region.appendChild(node);
  window.setTimeout(() => node.remove(), duration);
}

export function setLoading(button, loading, label = "Working…") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

export function openModal(html, wide = false) {
  const backdrop = $("#app-modal");
  const card = $("#app-modal-card");
  card.className = `modal-card${wide ? " wide" : ""}`;
  card.innerHTML = html;
  backdrop.classList.remove("hidden");
  const close = () => backdrop.classList.add("hidden");
  $("[data-close-modal]", card)?.addEventListener("click", close);
  backdrop.onclick = (event) => { if (event.target === backdrop) close(); };
  return { backdrop, card, close };
}

export function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}</div>`;
}

export function optionList(items, valueKey = "id", labelKey = "name", selected = "") {
  return items.map((item) => `<option value="${escapeHtml(item[valueKey])}" ${String(item[valueKey]) === String(selected) ? "selected" : ""}>${escapeHtml(item[labelKey])}</option>`).join("");
}

export function parseMaterialLines(text = "") {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [material_name, quantity = "1", unit = "units", quality_min = "0"] = line.split("|").map((part) => part.trim());
    return { material_name, quantity: Number(quantity) || 0, unit, quality_min: Number(quality_min) || 0 };
  });
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function titleCase(value = "") {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}
