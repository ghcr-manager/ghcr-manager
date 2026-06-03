import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import {
  buildBlockedValidationReason,
  buildPlanOutputs,
  buildProtectedRoots,
  buildRootDecisions
} from "../../../src/db/planner/_planner-output.js";
import { DeletePlanValidationStatuses, PlannerRepository, ScanWriter, openDatabase } from "../../../src/db/index.js";
import type { DeletePlanRoot } from "../../../src/db/planner/index.js";

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
  assert.equal(blockedPlan.rootDecisions[0]?.validationStatus, DeletePlanValidationStatuses.fullyDeletable);
  assert.deepEqual(blockedPlan.protectedRoots, []);

  database.close();
});

test("buildPlanOutputs removes untag-only roots from fully deletable execution targets", () => {
  const directTargetRoots: DeletePlanRoot[] = [
    {
      versionId: 1,
      digest: "sha256:selected",
      manifestKind: ManifestKinds.indexManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ];
  const planArtifacts: Parameters<typeof buildPlanOutputs>[2] = {
    closureManifests: [],
    blockedRoots: [
      {
        blockedVersionId: 1,
        blockedDigest: "sha256:selected",
        blockingVersionId: 2,
        blockingDigest: "sha256:keeper",
        overlapDigest: "sha256:selected",
        overlapManifestKind: ManifestKinds.indexManifest,
        reason: "overlap-with-retained-root"
      }
    ],
    fullyDeletableRoots: [directTargetRoots[0]!],
    supportedUntagOnlyRootDigests: new Set()
  };

  const planOutputs = buildPlanOutputs(["image-a"], directTargetRoots, planArtifacts);

  assert.equal(planOutputs.rootDecisions[0]?.validationStatus, DeletePlanValidationStatuses.untagOnly);
  assert.deepEqual(planOutputs.fullyDeletableRoots, []);
});

test("buildRootDecisions supports explicit untag-only and supported retained-manifest untag-only roots", () => {
  const directTargetRoots: DeletePlanRoot[] = [
    {
      versionId: 1,
      digest: "sha256:partial",
      manifestKind: ManifestKinds.imageManifest,
      reason: "delete-tags-partial-tag-match",
      selectionMode: "untag-only"
    },
    {
      versionId: 2,
      digest: "sha256:supported",
      manifestKind: ManifestKinds.indexManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ];

  const rootDecisions = buildRootDecisions(directTargetRoots, {
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    supportedUntagOnlyRootDigests: new Set(["sha256:supported"])
  });

  assert.equal(rootDecisions[0]?.validationStatus, DeletePlanValidationStatuses.untagOnly);
  assert.equal(rootDecisions[0]?.validationReasonCode, "untag-only-partial-tag-match");
  assert.equal(rootDecisions[1]?.validationStatus, DeletePlanValidationStatuses.untagOnly);
  assert.equal(rootDecisions[1]?.validationReasonCode, "untag-only-retained-manifest");
});

test("buildProtectedRoots groups multiple blocks under one retained digest and sorts groups", () => {
  const protectedRoots = buildProtectedRoots([
    {
      blockedVersionId: 1,
      blockedDigest: "sha256:blocked-a",
      blockingVersionId: 10,
      blockingDigest: "sha256:zeta",
      overlapDigest: "sha256:shared-a",
      overlapManifestKind: ManifestKinds.imageManifest,
      reason: "overlap-with-retained-root"
    },
    {
      blockedVersionId: 2,
      blockedDigest: "sha256:blocked-b",
      blockingVersionId: 9,
      blockingDigest: "sha256:alpha",
      overlapDigest: "sha256:shared-b",
      overlapManifestKind: ManifestKinds.indexManifest,
      reason: "overlap-with-retained-root"
    },
    {
      blockedVersionId: 3,
      blockedDigest: "sha256:blocked-c",
      blockingVersionId: 10,
      blockingDigest: "sha256:zeta",
      overlapDigest: "sha256:shared-c",
      overlapManifestKind: ManifestKinds.imageManifest,
      reason: "overlap-with-retained-root"
    }
  ]);

  assert.deepEqual(protectedRoots, [
    {
      versionId: 9,
      digest: "sha256:alpha",
      blocks: [
        {
          blockedVersionId: 2,
          blockedDigest: "sha256:blocked-b",
          blockReasonCode: "overlap-with-retained-root",
          overlapDigest: "sha256:shared-b",
          overlapManifestKind: ManifestKinds.indexManifest
        }
      ]
    },
    {
      versionId: 10,
      digest: "sha256:zeta",
      blocks: [
        {
          blockedVersionId: 1,
          blockedDigest: "sha256:blocked-a",
          blockReasonCode: "overlap-with-retained-root",
          overlapDigest: "sha256:shared-a",
          overlapManifestKind: ManifestKinds.imageManifest
        },
        {
          blockedVersionId: 3,
          blockedDigest: "sha256:blocked-c",
          blockReasonCode: "overlap-with-retained-root",
          overlapDigest: "sha256:shared-c",
          overlapManifestKind: ManifestKinds.imageManifest
        }
      ]
    }
  ]);
});

test("buildBlockedValidationReason falls back when no blocking root row is present", () => {
  assert.equal(
    buildBlockedValidationReason(),
    "root closure overlaps manifest members still required by a retained root"
  );
});
