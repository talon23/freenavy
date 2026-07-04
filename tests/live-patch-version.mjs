import assert from "node:assert/strict";
import { comparePatches, fullLiveVersion, isLiveRecord, normalisePatch } from "../netlify/lib/patch-version.mjs";

assert.deepEqual(normalisePatch("4.8.2-LIVE.12030094"), {
  patch: "4.8.2",
  build: "12030094",
  full: "4.8.2-LIVE.12030094",
});
assert.equal(fullLiveVersion("4.8.2-LIVE.12030094"), "4.8.2-LIVE.12030094");
assert.equal(comparePatches("4.8.3", "4.8.2"), 1);
assert.equal(comparePatches("4.8.2", "4.8.2-LIVE.12030094"), 0);
assert.equal(isLiveRecord({ version: "4.8.3-PTU.1" }), false);
assert.equal(isLiveRecord({ version: "4.8.3-EPTU.1" }), false);
assert.equal(isLiveRecord({ version: "4.8.3-LIVE.1" }), true);
console.log("LIVE patch helpers passed");
