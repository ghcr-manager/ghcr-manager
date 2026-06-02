import assert from "node:assert/strict";
import test from "node:test";
import { listTaggedOnlyDirectTargetRoots } from "../../../src/db/planner/_planner-direct-target-roots-tagged.js";

test("tagged direct target roots helper is exposed", () => {
  assert.equal(typeof listTaggedOnlyDirectTargetRoots, "function");
});
