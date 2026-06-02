import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import { PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";
import { importFileScan } from "../../helpers/index.js";

test("planner repository returns a delete-untagged plan for top-level untagged roots only", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const plan = repository.getDeleteUntaggedPlan("acme", "example");

  assert.deepEqual(plan.directTargetTags, []);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 104,
      digest: "sha256:untagged-old",
      manifestKind: ManifestKinds.imageManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.blockedRoots, []);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);
  assert.deepEqual(plan.collateralTags, []);
  assert.deepEqual(plan.closureManifests, [
    {
      sourceVersionId: 104,
      sourceDigest: "sha256:untagged-old",
      memberVersionId: 104,
      memberDigest: "sha256:untagged-old",
      memberManifestKind: ManifestKinds.imageManifest,
      hopsFromRoot: 0,
      memberRole: "root"
    }
  ]);

  database.close();
});

test("planner repository can combine tagged and untagged delete selectors in one SQL-backed plan", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const plan = repository.getCleanupPlanWithCutoff("acme", "example", {
    deleteTags: ["latest"],
    deleteTagsRequested: true,
    deleteUntagged: true
  });

  assert.deepEqual(plan.directTargetTags, ["latest"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 101,
      digest: "sha256:index-current",
      manifestKind: ManifestKinds.indexManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    },
    {
      versionId: 104,
      digest: "sha256:untagged-old",
      manifestKind: ManifestKinds.imageManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);

  database.close();
});

test("planner repository getLatestCompletedScanId returns the latest completed scan id", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);

  assert.equal(repository.getLatestCompletedScanId("acme", "example"), 1);

  database.close();
});

test("planner repository preserves keep planner inputs across combined and wrapper paths", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const keepTaggedPlan = repository.getCleanupPlanWithCutoff("acme", "example", {
    keepNTagged: 1,
    excludeTags: ["keep-me"],
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });
  const keepUntaggedPlan = repository.getKeepNUntaggedPlanWithCutoff("acme", "example", 0, {
    olderThan: "30 days",
    cutoffTimestamp: "2026-04-14T10:00:00.000Z"
  });

  assert.equal(keepTaggedPlan.plannerInputs.keepNTagged, 1);
  assert.deepEqual(keepTaggedPlan.plannerInputs.excludeTags, ["keep-me"]);
  assert.equal(keepTaggedPlan.plannerInputs.olderThan, "30 days");
  assert.equal(keepTaggedPlan.plannerInputs.cutoffTimestamp, "2026-04-14T10:00:00.000Z");

  assert.equal(keepUntaggedPlan.plannerInputs.keepNUntagged, 0);
  assert.equal(keepUntaggedPlan.plannerInputs.olderThan, "30 days");
  assert.equal(keepUntaggedPlan.plannerInputs.cutoffTimestamp, "2026-04-14T10:00:00.000Z");

  database.close();
});

test("planner repository omits empty and unset planner inputs from cleanup plans", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const plan = repository.getCleanupPlanWithCutoff("acme", "example", {
    deleteTags: [],
    excludeTags: [],
    deleteTagsRequested: false,
    deleteUntagged: false,
    useRegex: false
  });

  assert.deepEqual(plan.plannerInputs, {});

  database.close();
});

test("planner repository logs raw SQL statements and params at trace level", async () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const traceMessages: string[] = [];
  const debugMessages: string[] = [];
  const repository = new PlannerRepository(database, {
    trace(message: string) {
      traceMessages.push(message);
    },
    debug(message: string) {
      debugMessages.push(message);
    }
  });

  await importFileScan("tests/fixtures/sample-package.json", writer);

  const plan = repository.getDeleteUntaggedPlan("acme", "example");

  assert.equal(plan.directTargetRoots.length, 1);
  assert.ok(
    traceMessages.some((message) => message.includes("SELECT scan_id, owner, package_name, scan_completed_at"))
  );
  assert.ok(
    debugMessages.some((message) => message.includes("SELECT scan_id, owner, package_name, scan_completed_at"))
  );
  assert.ok(traceMessages.some((message) => message.includes('PARAMS: ["acme","example"]')));
  assert.ok(debugMessages.some((message) => message.includes("SQL returned")));

  database.close();
});

test("planner repository carries delete-ghost-images planner metadata through tagged-root planning", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.startScan("acme", "ghost-images", "2026-05-15T00:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:ghost-index",
    manifestKind: ManifestKinds.multiArchManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "ghost",
    versionId: 201
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:ghost-index",
    childDigest: "sha256:missing-amd64",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:ghost-index",
    childDigest: "sha256:missing-arm64",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "arm64" }
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "ghost-images", ["ghost"], [], {
    deleteGhostImages: true,
    deleteTagsRequested: true
  });

  assert.equal(plan.plannerInputs.deleteGhostImages, true);
  assert.deepEqual(plan.directTargetTags, ["ghost"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 201,
      digest: "sha256:ghost-index",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository carries delete-partial-images planner metadata through tagged-root planning", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);

  writer.startScan("acme", "partial-images", "2026-05-15T00:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:partial-index",
    manifestKind: ManifestKinds.multiArchManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertTag({
    tag: "partial",
    versionId: 201
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:partial-index",
    childDigest: "sha256:present-child",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "amd64" }
  });
  writer.insertManifestDescriptor({
    parentDigest: "sha256:partial-index",
    childDigest: "sha256:missing-arm64",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    platform: { os: "linux", architecture: "arm64" }
  });
  writer.insertPackageVersion({
    versionId: 202,
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 202,
    digest: "sha256:present-child",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.rebuildManifestReachability();
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "partial-images", ["partial"], [], {
    deletePartialImages: true,
    deleteTagsRequested: true
  });

  assert.equal(plan.plannerInputs.deletePartialImages, true);
  assert.deepEqual(plan.directTargetTags, ["partial"]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 201,
      digest: "sha256:partial-index",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});

test("planner repository carries delete-orphaned-images planner metadata through orphaned digest-tag planning", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const repository = new PlannerRepository(database);
  const orphanParentDigest = `sha256:${"a".repeat(64)}`;
  const orphanTag = `${orphanParentDigest.replace("sha256:", "sha256-")}.sig`;

  writer.startScan("acme", "orphaned-images", "2026-05-15T00:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 201,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 201,
    digest: "sha256:orphaned-signature",
    manifestKind: ManifestKinds.signatureManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({
    tag: orphanTag,
    versionId: 201
  });
  writer.markScanCompleted("2026-05-15T00:00:00.000Z");

  const plan = repository.getDeleteTagsPlanWithCutoff("acme", "orphaned-images", [orphanTag], [], {
    deleteOrphanedImages: true,
    deleteTagsRequested: true
  });

  assert.equal(plan.plannerInputs.deleteOrphanedImages, true);
  assert.deepEqual(plan.directTargetTags, [orphanTag]);
  assert.deepEqual(plan.directTargetRoots, [
    {
      versionId: 201,
      digest: "sha256:orphaned-signature",
      manifestKind: ManifestKinds.signatureManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  assert.deepEqual(plan.fullyDeletableRoots, plan.directTargetRoots);

  database.close();
});
