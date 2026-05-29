import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import { DeletePlanValidationStatuses, PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";

test("planner repository builds output decisions and protected roots", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

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
    digest: "sha256:fully",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "latest", versionId: 1 });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:partial",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ tag: "release-1", versionId: 2 });
  writer.insertTag({ tag: "stable", versionId: 2 });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:blocked",
    manifestKind: ManifestKinds.multiArchManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({ tag: "blocked", versionId: 3 });
  writer.insertPackageVersion({
    versionId: 4,
    createdAt: "2026-04-30T10:00:00.000Z",
    updatedAt: "2026-04-30T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 4,
    digest: "sha256:keeper",
    manifestKind: ManifestKinds.multiArchManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 5,
    createdAt: "2026-04-29T10:00:00.000Z",
    updatedAt: "2026-04-29T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 5,
    digest: "sha256:shared",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:blocked",
    childDigest: "sha256:shared",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:keeper",
    childDigest: "sha256:shared",
    edgeKind: "image-child"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-14T10:00:00.000Z");

  const partialPlan = repository.getDeleteTagsPlan("acme", "pkg", ["release-*"], []);
  const fullyPlan = repository.getDeleteTagsPlan("acme", "pkg", ["latest"], []);
  const blockedPlan = repository.getDeleteTagsPlan("acme", "pkg", ["blocked"], []);

  assert.equal(partialPlan.rootDecisions[0]?.validationStatus, DeletePlanValidationStatuses.untagOnly);
  assert.equal(fullyPlan.rootDecisions[0]?.validationStatus, DeletePlanValidationStatuses.fullyDeletable);
  assert.equal(blockedPlan.rootDecisions[0]?.validationStatus, DeletePlanValidationStatuses.blocked);
  assert.equal(blockedPlan.protectedRoots[0]?.digest, "sha256:keeper");

  database.close();
});
