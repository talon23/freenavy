import assert from "node:assert/strict";
import {
  BASELINE_SOURCE_VERSION,
  blueprintMaterials,
  classifyVehicle,
  fetchWikiCategory,
} from "../netlify/lib/live-patch-data.mjs";

assert.equal(classifyVehicle({ is_vehicle: true, is_spaceship: false, name: "Ursa" }), "vehicle");
assert.equal(classifyVehicle({ is_gravlev: true, is_spaceship: false, name: "Dragonfly" }), "vehicle");
assert.equal(classifyVehicle({ is_vehicle: true, is_spaceship: true, name: "Cutlass" }), "ship");
assert.equal(classifyVehicle({ classification: "fighter", name: "Arrow" }), "ship");

const materials = blueprintMaterials({
  ingredients: [
    { quantity: 12, item: { uuid: "mat-1", name: "RMC" } },
    { amount: "4", material: { id: "mat-2", display_name: "CMAT" }, unit: "SCU" },
  ],
});
assert.deepEqual(materials.map(({ materialKey, materialName, quantity, unit }) => ({ materialKey, materialName, quantity, unit })), [
  { materialKey: "mat-1", materialName: "RMC", quantity: 12, unit: null },
  { materialKey: "mat-2", materialName: "CMAT", quantity: 4, unit: "SCU" },
]);

const originalFetch = globalThis.fetch;
const requested = [];
globalThis.fetch = async (url) => {
  requested.push(String(url));
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ data: [{ uuid: "one", name: "Fixture" }], links: { next: null } }),
  };
};
try {
  const vehicles = await fetchWikiCategory("ship", BASELINE_SOURCE_VERSION);
  const blueprints = await fetchWikiCategory("blueprint", BASELINE_SOURCE_VERSION);
  assert.equal(vehicles.length, 1);
  assert.equal(blueprints.length, 1);
  assert.match(requested[0], /\/api\/vehicles\?/);
  assert.match(requested[0], /version=4\.8\.2-LIVE\.12030094/);
  assert.match(requested[0], /page%5Bsize%5D=200/);
  assert.match(requested[1], /\/api\/blueprints\?/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("LIVE import shape tests passed.");
