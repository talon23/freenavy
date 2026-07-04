import assert from "node:assert/strict";
import { capabilities, RANKS, APPOINTMENTS } from "../netlify/lib/netlify.mjs";

function profile(rank, roles = [], extra = {}) {
  const base = { id: "00000000-0000-0000-0000-000000000001", rank, roles, membership_stage: "full", capability_overrides: {}, ...extra };
  base.capabilities = capabilities(base);
  return base;
}

assert.deepEqual(RANKS, [
  "president","vice_president","general","admiral","vice_admiral",
  "rear_admiral","brigadier_general","officer","enlisted"
]);
assert.deepEqual(APPOINTMENTS, ["admin","quartermaster","treasurer"]);

const enlisted = profile("enlisted");
assert.equal(enlisted.capabilities.view_portal, true);
assert.equal(enlisted.capabilities.flag_data, true);
assert.equal(enlisted.capabilities.submit_locations, true);
assert.equal(enlisted.capabilities.edit_game_data, false);
assert.equal(enlisted.capabilities.manage_warehouse, false);
assert.equal(enlisted.capabilities.manage_treasury, false);

const officer = profile("officer");
assert.equal(officer.capabilities.edit_game_data, true);
assert.equal(officer.capabilities.approve_applications, true);
assert.equal(officer.capabilities.manage_operations, true);
assert.equal(officer.capabilities.manage_warehouse, false);
assert.equal(officer.capabilities.manage_treasury, false);

const officerQuartermaster = profile("officer", ["quartermaster"]);
assert.equal(officerQuartermaster.capabilities.edit_game_data, true);
assert.equal(officerQuartermaster.capabilities.manage_warehouse, true);
assert.equal(officerQuartermaster.capabilities.manage_treasury, false);

const enlistedTreasurer = profile("enlisted", ["treasurer"]);
assert.equal(enlistedTreasurer.capabilities.manage_treasury, true);
assert.equal(enlistedTreasurer.capabilities.manage_warehouse, false);
assert.equal(enlistedTreasurer.capabilities.edit_game_data, false);

const adminOfficer = profile("officer", ["admin"]);
assert.equal(adminOfficer.capabilities.manage_site, true);
assert.equal(adminOfficer.capabilities.manage_members, true);
assert.equal(adminOfficer.capabilities.manage_treasury, false);
assert.equal(adminOfficer.capabilities.manage_warehouse, false);

const enlistedAdmin = profile("enlisted", ["admin"]);
assert.equal(enlistedAdmin.capabilities.manage_site, true);
assert.equal(enlistedAdmin.capabilities.approve_applications, true);
assert.equal(enlistedAdmin.capabilities.view_signup_link, false);
assert.equal(enlistedAdmin.capabilities.manage_signup_link, false);
assert.equal(officer.capabilities.view_signup_link, true);
assert.equal(officer.capabilities.manage_signup_link, true);

const vp = profile("vice_president");
assert.equal(vp.capabilities.assign_ranks, true);
assert.equal(vp.capabilities.assign_appointments, true);
assert.equal(vp.capabilities.manage_permissions, true);
assert.equal(vp.capabilities.restore_backups, false);

const president = profile("president");
assert.equal(president.capabilities.restore_backups, true);
assert.equal(president.capabilities.assign_ranks, true);

const probationaryQuartermaster = profile("officer", ["quartermaster"], { membership_stage: "probationary" });
assert.equal(probationaryQuartermaster.capabilities.manage_warehouse, false);
assert.equal(probationaryQuartermaster.capabilities.view_sensitive, false);

const attemptedProtectedOverride = profile("enlisted", [], {
  capability_overrides: { assign_ranks: true, restore_backups: true, manage_warehouse: true }
});
assert.equal(attemptedProtectedOverride.capabilities.assign_ranks, false);
assert.equal(attemptedProtectedOverride.capabilities.restore_backups, false);
assert.equal(attemptedProtectedOverride.capabilities.manage_warehouse, true);

console.log("Permission matrix tests passed.");
