import assert from "node:assert/strict";
import test from "node:test";
import type { DeleteExecutionSummary } from "../../src/execute/_types.js";

test("execute types expose delete execution summaries", () => {
  const summary: DeleteExecutionSummary = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: true,
      deleteTags: [],
      excludeTags: []
    },
    deletedPackageVersionCount: 0,
    detachedTagCount: 0,
    blockedRoots: []
  };

  assert.equal(summary.owner, "acme");
});
