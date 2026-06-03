import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import { PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";

test("planner repository logs read SQL through the shared planner sql helper at debug level", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const debugMessages: string[] = [];
  const repository = new PlannerRepository(database, {
    trace() {},
    debug(message: string) {
      debugMessages.push(message);
    }
  });

  writer.startScan("acme", "pkg", "2026-05-14T10:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-05-03T10:00:00.000Z",
    updatedAt: "2026-05-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:root",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const plan = repository.getDeleteUntaggedPlan("acme", "pkg");

  assert.equal(plan.directTargetRoots.length, 1);
  assert.ok(
    debugMessages.some((message) => message.includes("SELECT scan_id, owner, package_name, scan_completed_at"))
  );
  assert.ok(debugMessages.some((message) => message.includes("SQL returned 1 row(s)")));

  database.close();
});
