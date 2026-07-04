import { login, logout, getUser, handleAuthCallback, requestPasswordRecovery, acceptInvite, updateUser } from "@netlify/identity";
import { sampleData, sampleProfile, sampleUex } from "./sample-data.js";
import { uid } from "./utils.js";

const config = window.FREE_NAVY_CONFIG || {};
const configured = config.netlifyIdentityEnabled !== false;
const DEMO_KEY = "free-navy-demo-database-v5-netlify";
let mode = configured ? "live" : "unconfigured";
let profile = null;
let pendingInviteToken = null;
let pendingRecovery = false;

const clone = (value) => JSON.parse(JSON.stringify(value));
function loadDemo() {
  const existing = localStorage.getItem(DEMO_KEY);
  if (existing) { try { return JSON.parse(existing); } catch { localStorage.removeItem(DEMO_KEY); } }
  const seeded = clone(sampleData);
  localStorage.setItem(DEMO_KEY, JSON.stringify(seeded));
  return seeded;
}
function saveDemo(data) { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); }
function demoProfileById(id) { return loadDemo().profiles.find((row) => row.id === id) || null; }
function demoAudit(data, action, table, entity) {
  data.audit_log ||= [];
  data.audit_log.push({ id: uid(), actor_id: profile?.id || "system", action, entity_type: table, entity_name: entity?.name || entity?.title || entity?.id || "record", created_at: new Date().toISOString() });
}

async function api(body) {
  const response = await fetch(config.portalApiPath || "/api/portal", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Portal request failed.");
  return result.data ?? result;
}
async function loadProfile() {
  const result = await api({ action: "profile" });
  profile = result.profile || result;
  return profile;
}

export const db = {
  get mode() { return mode; },
  get configured() { return configured; },
  get profile() { return profile; },

  async initialise() {
    if (!configured) return { mode, profile: null, session: null };
    try {
      const callback = await handleAuthCallback();
      if (callback?.type === "invite") { pendingInviteToken = callback.token; return { mode: "live", profile: null, pendingInvite: true }; }
      if (callback?.type === "recovery") pendingRecovery = true;
    } catch (error) { console.warn("Identity callback could not be completed", error); }
    const user = await getUser();
    if (!user) return { mode: "live", profile: null, pendingRecovery };
    profile = await loadProfile();
    return { mode: "live", profile, session: user, pendingRecovery };
  },

  async login(email, password) {
    if (!configured) throw new Error("Netlify Identity is not enabled yet.");
    await login(email, password);
    profile = await loadProfile();
    return profile;
  },

  async completeInvite(password) {
    if (!pendingInviteToken) throw new Error("No invitation token is available.");
    await acceptInvite(pendingInviteToken, password);
    pendingInviteToken = null;
    history.replaceState(null, "", window.location.pathname);
    profile = await loadProfile();
    return profile;
  },

  async completeRecovery(password) {
    if (!pendingRecovery) throw new Error("No password recovery session is active.");
    await updateUser({ password });
    pendingRecovery = false;
    history.replaceState(null, "", window.location.pathname);
    profile = await loadProfile();
    return profile;
  },

  async enterDemo() { mode = "demo"; profile = clone(sampleProfile); loadDemo(); return profile; },
  async logout() { if (mode === "live") await logout(); profile = null; if (!configured) mode = "unconfigured"; },
  async resetPassword(email) { await requestPasswordRecovery(email); },

  async list(table, { order = "created_at", ascending = false, filters = [], includeAllVersions = false, limit = 1000 } = {}) {
    if (mode === "demo") {
      let rows = clone(loadDemo()[table] || []);
      for (const [column, operator, value] of filters) {
        if (operator === "eq") rows = rows.filter((row) => String(row[column]) === String(value));
        if (operator === "neq") rows = rows.filter((row) => String(row[column]) !== String(value));
        if (operator === "is") rows = rows.filter((row) => row[column] === value);
      }
      if (order && rows.some((row) => row[order] !== undefined)) rows.sort((a,b) => ((a[order]??"")>(b[order]??"")?1:(a[order]??"")<(b[order]??"")?-1:0)*(ascending?1:-1));
      return rows;
    }
    return api({ action: "list", table, options: { order, ascending, filters, includeAllVersions, limit } });
  },

  async profiles() { return this.list("profiles", { order: "display_name", ascending: true }); },
  async blueprints() { if (mode === "demo") return clone(loadDemo().blueprints || []); return api({ action: "blueprints" }); },

  async create(table, payload) {
    if (mode === "demo") {
      const data = loadDemo(); const row = { id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...payload };
      data[table] ||= []; data[table].push(row); demoAudit(data, `${table}.create`, table, row); saveDemo(data); return clone(row);
    }
    return api({ action: "create", table, payload });
  },

  async update(table, id, payload) {
    if (mode === "demo") {
      const data = loadDemo(); const index = (data[table] || []).findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Record not found.");
      data[table][index] = { ...data[table][index], ...payload, updated_at: new Date().toISOString() };
      demoAudit(data, `${table}.update`, table, data[table][index]);
      if (table === "profiles" && id === profile?.id) profile = clone(data[table][index]);
      saveDemo(data); return clone(data[table][index]);
    }
    const row = await api({ action: "update", table, id, payload });
    if (table === "profiles" && id === profile?.id) profile = row;
    return row;
  },

  async remove(table, id) {
    if (mode === "demo") {
      const data = loadDemo(); const row = (data[table] || []).find((item) => item.id === id);
      data[table] = (data[table] || []).filter((item) => item.id !== id); demoAudit(data, `${table}.delete`, table, row || { id }); saveDemo(data); return true;
    }
    return api({ action: "delete", table, id });
  },

  async createBlueprint(payload, materials) {
    if (mode === "demo") {
      const data = loadDemo(); const row = { id: uid(), created_at: new Date().toISOString(), ...payload, materials };
      data.blueprints.push(row); demoAudit(data, "blueprint.create", "blueprints", row); saveDemo(data); return row;
    }
    return api({ action: "createBlueprint", payload, materials });
  },

  async uploadWarehouseImage(file) {
    if (!file) return "";
    if (mode === "demo") return URL.createObjectURL(file);
    const form = new FormData(); form.append("file", file);
    const response = await fetch(config.warehouseImagePath || "/api/warehouse-image", { method: "POST", credentials: "same-origin", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Image upload failed.");
    return result.url;
  },

  async rpc(name, params = {}) {
    if (mode === "demo") return this.demoRpc(name, params);
    const result = await api({ action: "rpc", name, params });
    if (["award_member_points","place_auction_bid","resolve_auction"].includes(name)) { try { await loadProfile(); } catch {} }
    return result;
  },

  async demoRpc(name, params) {
    const data = loadDemo();
    if (name === "award_member_points") {
      const target = data.profiles.find((row) => row.id === params.target_member); if (!target) throw new Error("Member not found.");
      const amount = Number(params.point_amount || 0); target.points_balance += amount;
      data.points_ledger.push({ id: uid(), member_id: target.id, amount, reason: params.point_reason || "Admin adjustment", linked_record: params.linked_record || "", created_by: profile.id, created_at: new Date().toISOString() });
      demoAudit(data, "points.award", "profiles", target); if (target.id === profile.id) profile.points_balance = target.points_balance; saveDemo(data); return target.points_balance;
    }
    if (name === "place_auction_bid") {
      const auction = data.auctions.find((row) => row.id === params.target_auction); const bidder = data.profiles.find((row) => row.id === profile.id); const amount = Number(params.bid_amount);
      if (!auction || auction.status !== "open" || new Date(auction.ends_at) <= new Date()) throw new Error("This auction is not open.");
      if (amount <= Number(auction.current_bid || auction.starting_bid || 0)) throw new Error("Bid must exceed the current bid.");
      if (bidder.points_balance < amount) throw new Error("You do not have enough points.");
      if (auction.current_winner_id) { const previous = data.profiles.find((row) => row.id === auction.current_winner_id); if (previous) previous.points_balance += Number(auction.current_bid || 0); }
      bidder.points_balance -= amount; auction.current_bid = amount; auction.current_winner_id = bidder.id;
      data.auction_bids.push({ id: uid(), auction_id: auction.id, bidder_id: bidder.id, amount, created_at: new Date().toISOString() }); profile.points_balance = bidder.points_balance; demoAudit(data, "auction.bid", "auctions", auction); saveDemo(data); return amount;
    }
    if (name === "rsvp_operation") {
      const current = data.operation_attendance.find((row) => row.operation_id === params.target_operation && row.member_id === profile.id);
      if (current) { current.status = params.response_status; current.crew_role = params.crew_role || current.crew_role || ""; }
      else data.operation_attendance.push({ id: uid(), operation_id: params.target_operation, member_id: profile.id, status: params.response_status, crew_role: params.crew_role || "" });
      saveDemo(data); return true;
    }
    if (name === "claim_org_job") {
      if (!["work_orders", "contracts"].includes(params.target_table)) throw new Error("Unsupported claim type.");
      const row = (data[params.target_table] || []).find((item) => item.id === params.target_id);
      if (!row || row.status !== "open") throw new Error("This job is no longer open.");
      row.status = "claimed"; row.claimed_by = profile.id; row.updated_at = new Date().toISOString();
      demoAudit(data, "job.claim", params.target_table, row); saveDemo(data); return true;
    }
    if (name === "confirm_live_record") {
      if (!["knowledge_locations", "mining_locations", "salvage_locations"].includes(params.target_table)) throw new Error("Unsupported verification type.");
      if (String(params.live_version) !== String(config.livePatch)) throw new Error("Confirmation must match the current LIVE patch.");
      const row = (data[params.target_table] || []).find((item) => item.id === params.target_id);
      if (!row || row.status === "rejected") throw new Error("This record cannot be confirmed.");
      data.live_confirmations ||= [];
      if (data.live_confirmations.some((item) => item.record_table === params.target_table && item.record_id === params.target_id && item.member_id === profile.id && item.game_version === config.livePatch)) throw new Error("You have already confirmed this record for the current LIVE patch.");
      data.live_confirmations.push({ id: uid(), record_table: params.target_table, record_id: params.target_id, member_id: profile.id, game_version: config.livePatch, confirmed_at: new Date().toISOString() });
      row.confirmations = Number(row.confirmations || 0) + 1; row.last_confirmed_at = new Date().toISOString(); row.game_version = config.livePatch; row.updated_at = new Date().toISOString();
      demoAudit(data, "live.confirm", params.target_table, row); saveDemo(data); return row.confirmations;
    }
    if (name === "accept_rescue_request") {
      const row = data.rescue_requests.find((item) => item.id === params.target_request);
      if (!row || row.status !== "open") throw new Error("This request is no longer open.");
      row.status = "accepted"; row.responder_id = profile.id; row.updated_at = new Date().toISOString();
      demoAudit(data, "rescue.accept", "rescue_requests", row); saveDemo(data); return true;
    }
    if (name === "mark_notification_read") {
      const row = data.notifications.find((item) => item.id === params.target_notification && item.member_id === profile.id);
      if (!row) throw new Error("Notification not found.");
      row.read_at = new Date().toISOString(); saveDemo(data); return true;
    }
    if (name === "mark_all_notifications_read") {
      for (const row of data.notifications.filter((item) => item.member_id === profile.id && !item.read_at)) row.read_at = new Date().toISOString();
      saveDemo(data); return true;
    }
    if (name === "resolve_auction") {
      const auction = data.auctions.find((row) => row.id === params.target_auction);
      if (!auction || auction.status !== "open") throw new Error("Auction is not open.");
      if (!["completed","cancelled"].includes(params.resolution)) throw new Error("Invalid auction resolution.");
      if (params.resolution === "cancelled" && auction.current_winner_id) {
        const winner = data.profiles.find((row) => row.id === auction.current_winner_id);
        if (winner) winner.points_balance += Number(auction.current_bid || 0);
        if (auction.current_winner_id === profile.id) profile.points_balance += Number(auction.current_bid || 0);
      }
      auction.status = params.resolution; auction.updated_at = new Date().toISOString();
      demoAudit(data, "auction.resolve", "auctions", auction); saveDemo(data); return true;
    }
    if (name === "adjust_warehouse_reservation") {
      const item = data.warehouse_items.find((row) => row.id === params.target_item);
      if (!item) throw new Error("Warehouse item not found.");
      const next = Number(item.reserved_quantity || 0) + Number(params.quantity_delta || 0);
      if (next < 0 || next > Number(item.quantity || 0)) throw new Error("Reservation would exceed available stock or fall below zero.");
      item.reserved_quantity = next; item.updated_at = new Date().toISOString();
      data.inventory_movements.push({ id: uid(), item_name: item.name, quantity: Math.abs(Number(params.quantity_delta || 0)), unit: item.unit, movement_type: Number(params.quantity_delta) >= 0 ? "reserved" : "released", from_location: item.storage_location, to_location: params.linked_reference || "Organisation reserve", member_id: profile.id, linked_record: params.linked_reference || "", status: "complete", created_at: new Date().toISOString() });
      demoAudit(data, "warehouse.reserve", "warehouse_items", item); saveDemo(data); return next;
    }
    if (name === "generate_shortage_work_orders") {
      let count = 0;
      for (const item of data.warehouse_items) {
        const available = Number(item.quantity || 0) - Number(item.reserved_quantity || 0);
        if (available >= Number(item.minimum_stock || 0)) continue;
        const link = `warehouse-shortage:${item.id}`;
        if (data.work_orders.some((row) => row.linked_module === link && !["completed","cancelled"].includes(row.status))) continue;
        data.work_orders.push({ id: uid(), title: `Restock ${item.name}`, category: "Warehouse restock", item_name: item.name, target_quantity: Number(item.minimum_stock || 0), current_quantity: Math.max(0, available), unit: item.unit, reward_points: 0, reward_auec: 0, priority: available <= 0 ? "critical" : "high", status: "open", claimed_by: "", linked_module: link, deadline: new Date(Date.now()+7*86400000).toISOString(), game_version: config.livePatch, description: `Automatically created because available stock fell below ${item.minimum_stock} ${item.unit || "units"}.`, created_at: new Date().toISOString() });
        count += 1;
      }
      saveDemo(data); return count;
    }
    if (name === "claim_wreck_report") {
      const row = data.wreck_reports.find((item) => item.id === params.target_wreck);
      if (!row || !["open","reported","available"].includes(row.status) || (row.expires_at && new Date(row.expires_at) <= new Date())) throw new Error("This wreck is no longer available.");
      row.status = "claimed"; row.claimed_by = profile.id; row.updated_at = new Date().toISOString();
      demoAudit(data, "wreck.claim", "wreck_reports", row); saveDemo(data); return true;
    }
    throw new Error(`Demo action ${name} is not implemented.`);
  },

  async inviteMember(email, displayName, rank = "enlisted", rsiHandle = "", discordHandle = "", probationDays = 14) {
    if (mode === "demo") {
      const data = loadDemo(); data.profiles.push({ id: uid(), display_name: displayName, rsi_handle: rsiHandle || "Pending", discord_handle: discordHandle, role: "member", rank, roles: [], status: "invited", points_balance: 0, email }); saveDemo(data); return { email };
    }
    const response = await fetch(config.inviteMemberPath || "/api/invite-member", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, displayName, rank, rsiHandle, discordHandle, probationDays }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Invitation failed.");
    return result;
  },

  async signupLink(action = null, options = {}) {
    const requestOptions = action
      ? { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...options }) }
      : { credentials: "same-origin" };
    const response = await fetch(config.signupLinkPath || "/api/signup-link", requestOptions);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not generate the private signup link.");
    return result;
  },

  async submitMembershipApplication(payload) {
    const response = await fetch(config.membershipRequestPath || "/api/membership-request", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Membership application failed.");
    return result;
  },

  async runGameImport(source = "all", dryRun = false) {
    if (mode === "demo") return { accepted: true, source, demo: true };
    const response = await fetch(config.gameDataSyncPath || "/api/sync-game-data", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, dry_run: Boolean(dryRun) }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Game data import could not start.");
    return result;
  },

  async uex(resource, params = {}) {
    if (mode === "demo") {
      if (resource === "commodities") return { data: clone(sampleUex.commodities), demo: true, supported_version: config.livePatch };
      if (resource === "terminals") return { data: clone(sampleUex.terminals), demo: true, supported_version: config.livePatch };
      if (resource === "commodities_routes") return { data: clone(sampleUex.routes), demo: true, supported_version: config.livePatch };
      if (resource === "commodities_prices") { const name = String(params.commodity_name || "").toLowerCase(); return { data: clone(sampleUex.commodity_prices.filter((row) => !name || row.commodity_name.toLowerCase().includes(name))), demo: true, supported_version: config.livePatch }; }
      if (resource === "items_prices") { const id = String(params.id_item || ""); return { data: clone(sampleUex.item_prices.filter((row) => !id || String(row.id_item) === id)), demo: true, supported_version: config.livePatch }; }
      return { data: [], demo: true, supported_version: config.livePatch };
    }
    const query = new URLSearchParams({ resource, ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value != null)) });
    const response = await fetch(`${config.uexProxyPath || "/api/uex"}?${query}`, { credentials: "same-origin" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "UEX request failed.");
    return result;
  },

  async liveVersion() {
    if (mode === "demo" || !configured) return { version: config.livePatch, environment: "LIVE", source: "Configured official LIVE gate", checked_at: new Date().toISOString() };
    try { const response = await fetch(config.liveVersionPath || "/api/live-version"); if (!response.ok) throw new Error(); return response.json(); }
    catch { return { version: config.livePatch, environment: "LIVE", source: "Configured fallback", checked_at: new Date().toISOString() }; }
  },


  async refreshProfile() {
    if (mode === "demo") return profile;
    return loadProfile();
  },

  async listBackups() {
    if (mode === "demo") return [];
    const response = await fetch(config.backupPath || "/api/backups", { credentials: "same-origin" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not load backups.");
    return result.data || [];
  },

  async backupAction(action, payload = {}) {
    if (mode === "demo") {
      if (action === "create") return { id: uid(), backup_key: `demo/${Date.now()}.json`, status: "completed", backup_type: "manual", row_count: 0, table_count: 0, created_at: new Date().toISOString() };
      if (action === "preview") return { metadata: { format: "demo" }, tables: {} };
      return true;
    }
    const response = await fetch(config.backupPath || "/api/backups", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Backup action failed.");
    return result.data ?? result;
  },

  backupDownloadUrl(key) {
    return `${config.backupPath || "/api/backups"}?key=${encodeURIComponent(key)}`;
  },

  async snapshot() { if (mode === "demo") return clone(loadDemo()); return api({ action: "snapshot" }); },
  async backup() { if (mode === "demo") return clone(loadDemo()); return api({ action: "backup" }); },
  resetDemo() { localStorage.removeItem(DEMO_KEY); loadDemo(); profile = clone(sampleProfile); },
  profileById(id, profiles = []) { return profiles.find((item) => item.id === id) || (mode === "demo" ? demoProfileById(id) : null); }
};
