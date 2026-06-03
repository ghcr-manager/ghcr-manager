import assert from "node:assert/strict";
import test from "node:test";
import { buildCombinedDirectTargetRootsQuery } from "../../../src/db/planner/_planner-direct-target-roots-combined-sql.js";

test("combined direct target roots query helper is exposed", () => {
  assert.equal(typeof buildCombinedDirectTargetRootsQuery, "function");
});
