import assert from "node:assert/strict";
import test from "node:test";
import type { DirectTargetRootOptions } from "../../../src/db/planner/_planner-direct-target-root-options.js";

test("direct target root options describe planner inputs", () => {
  const options: DirectTargetRootOptions = {
    deleteTags: ["delete-me"],
    deleteTagsRequested: true,
    excludeTags: [],
    deleteUntagged: false
  };

  assert.equal(options.deleteTagsRequested, true);
});
