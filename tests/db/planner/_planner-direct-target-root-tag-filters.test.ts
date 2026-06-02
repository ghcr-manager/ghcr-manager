import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectTargetRootTagFilters } from "../../../src/db/planner/_planner-direct-target-root-tag-filters.js";

test("direct target root tag filters helper is exposed", () => {
  assert.equal(typeof buildDirectTargetRootTagFilters, "function");
});
