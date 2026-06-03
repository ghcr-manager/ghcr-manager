import assert from "node:assert/strict";
import test from "node:test";
import { _LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL } from "../../../src/db/planner/_planner-plan-artifacts-supported-untag-only-sql.js";

test("supported untag-only sql requires signature referrers and retained payload children", () => {
  assert.match(_LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL, /edge_kind = 'referrer'/);
  assert.match(_LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL, /child\.manifest_kind = 'signature_manifest'/);
  assert.match(_LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL, /child\.digest NOT IN/);
});
