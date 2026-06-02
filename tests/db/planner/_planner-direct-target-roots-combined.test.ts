import assert from "node:assert/strict";
import test from "node:test";
import { listCombinedDirectTargetRoots } from "../../../src/db/planner/_planner-direct-target-roots-combined.js";

test("combined direct target roots helper is exposed", () => {
  assert.equal(typeof listCombinedDirectTargetRoots, "function");
});
