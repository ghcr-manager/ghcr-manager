import assert from "node:assert/strict";
import test from "node:test";
import { _LIST_CLOSURE_MANIFESTS_SQL } from "../../../src/db/planner/_planner-plan-artifacts-closure-sql.js";

test("closure sql includes the recursive connected-component walk for deletable manifests", () => {
  assert.match(_LIST_CLOSURE_MANIFESTS_SQL, /WITH selected_graphs AS/);
  assert.match(_LIST_CLOSURE_MANIFESTS_SQL, /delete_component_members AS/);
  assert.match(_LIST_CLOSURE_MANIFESTS_SQL, /member_role/);
});
