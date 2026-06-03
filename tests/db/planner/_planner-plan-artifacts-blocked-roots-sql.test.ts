import assert from "node:assert/strict";
import test from "node:test";
import { _LIST_BLOCKED_ROOTS_SQL } from "../../../src/db/planner/_planner-plan-artifacts-blocked-roots-sql.js";

test("blocked roots sql ranks overlap rows down to one blocking row per retained digest", () => {
  assert.match(_LIST_BLOCKED_ROOTS_SQL, /ROW_NUMBER\(\) OVER/);
  assert.match(_LIST_BLOCKED_ROOTS_SQL, /WHERE rn = 1/);
  assert.match(_LIST_BLOCKED_ROOTS_SQL, /overlap-with-retained-root/);
});
