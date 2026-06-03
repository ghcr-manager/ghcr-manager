import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../src/core/index.js";
import { DeletePlanValidationReasonCodes, DeletePlanValidationStatuses } from "../../src/db/index.js";
import { buildCleanupSummary } from "../../src/cleanup-summary/index.js";

test("buildCleanupSummary groups root decisions and carries live execution effects", () => {
  const summary = buildCleanupSummary(
    {
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      plannerInputs: { deleteTags: ["delete-me"], useRegex: true },
      directTargetTags: ["delete-me"],
      directTargetRoots: [],
      rootDecisions: [
        {
          versionId: 101,
          digest: "sha256:fully",
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.fullyDeletable,
          validationReasonCode: DeletePlanValidationReasonCodes.fullyDeletableNoRetainedOverlap,
          validationReason: "No retained overlap"
        },
        {
          versionId: 102,
          digest: "sha256:untag",
          selectionMode: "delete-root",
          selectionReason: "delete-tags-partial-tag-match",
          validationStatus: DeletePlanValidationStatuses.untagOnly,
          validationReasonCode: DeletePlanValidationReasonCodes.untagOnlyPartialTagMatch,
          validationReason: "Only selected tags can be detached"
        },
        {
          versionId: 103,
          digest: "sha256:blocked",
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.blocked,
          validationReasonCode: DeletePlanValidationReasonCodes.blockedOverlapWithRetainedRoot,
          validationReason: "Retained overlap exists",
          blockingVersionId: 104,
          blockingDigest: "sha256:blocker",
          overlapDigest: "sha256:overlap"
        }
      ],
      protectedRoots: [],
      closureManifests: [
        {
          sourceVersionId: 101,
          sourceDigest: "sha256:fully",
          memberVersionId: 101,
          memberDigest: "sha256:fully",
          memberManifestKind: ManifestKinds.multiArchManifest,
          hopsFromRoot: 0,
          memberRole: "root"
        },
        {
          sourceVersionId: 101,
          sourceDigest: "sha256:fully",
          memberVersionId: 201,
          memberDigest: "sha256:child",
          memberManifestKind: ManifestKinds.imageManifest,
          hopsFromRoot: 1,
          memberRole: "child"
        }
      ],
      blockedRoots: [],
      fullyDeletableRoots: [],
      collateralTags: ["keep-me"]
    },
    {
      dryRun: false,
      rootTagsByVersionId: new Map([
        [101, ["delete-me"]],
        [102, ["delete-me", "keep-me"]],
        [103, ["delete-me"]]
      ]),
      changes: {
        deletedTags: 1,
        deletedImages: 1,
        deletedIndexes: 0,
        deletedMultiArchManifests: 1,
        deletedArtifactManifests: 0,
        deletedAttestations: 0,
        deletedSignatures: 0,
        deletedTotal: 2
      },
      executionSummary: {
        owner: "acme",
        packageName: "example",
        scanCompletedAt: "2026-05-20T10:00:00.000Z",
        plannerInputs: { deleteTags: ["delete-me"] },
        deletedPackageVersionCount: 1,
        detachedTagCount: 1,
        blockedRoots: []
      }
    }
  );

  assert.equal(summary.command, "cleanup");
  assert.equal(summary.dryRun, false);
  assert.deepEqual(summary.directTargetTags, ["delete-me"]);
  assert.deepEqual(summary.collateralTags, ["keep-me"]);
  assert.equal(summary.fullyDeletableRoots.length, 1);
  assert.equal(summary.untagOnlyRoots.length, 1);
  assert.equal(summary.blockedRoots.length, 1);
  assert.deepEqual(summary.affectedManifests, [
    { digest: "sha256:child", manifestKind: ManifestKinds.imageManifest },
    { digest: "sha256:fully", manifestKind: ManifestKinds.multiArchManifest }
  ]);
  assert.deepEqual(summary.changes, {
    deletedTags: 1,
    deletedImages: 1,
    deletedIndexes: 0,
    deletedMultiArchManifests: 1,
    deletedArtifactManifests: 0,
    deletedAttestations: 0,
    deletedSignatures: 0,
    deletedTotal: 2
  });
  assert.deepEqual(summary.untagOnlyRoots[0]?.matchedTags, ["delete-me"]);
  assert.equal(summary.deletedPackageVersionCount, 1);
  assert.equal(summary.detachedTagCount, 1);
  assert.equal(summary.blockedRoots[0]?.blockingVersionId, 104);
});

test("buildCleanupSummary trusts planner-facing direct target tags as already filtered for user output", () => {
  const summary = buildCleanupSummary(
    {
      owner: "acme",
      packageName: "example",
      scanCompletedAt: "2026-05-20T10:00:00.000Z",
      plannerInputs: { deleteTags: [".*"], useRegex: true },
      directTargetTags: ["release-1"],
      directTargetRoots: [],
      rootDecisions: [
        {
          versionId: 101,
          digest: "sha256:fully",
          selectionMode: "delete-root",
          selectionReason: "delete-tags-all-tags-selected",
          validationStatus: DeletePlanValidationStatuses.fullyDeletable,
          validationReasonCode: DeletePlanValidationReasonCodes.fullyDeletableNoRetainedOverlap,
          validationReason: "No retained overlap"
        }
      ],
      protectedRoots: [],
      closureManifests: [
        {
          sourceVersionId: 101,
          sourceDigest: "sha256:fully",
          memberVersionId: 101,
          memberDigest: "sha256:fully",
          memberManifestKind: ManifestKinds.imageManifest,
          hopsFromRoot: 0,
          memberRole: "root"
        }
      ],
      blockedRoots: [],
      fullyDeletableRoots: [],
      collateralTags: []
    },
    {
      dryRun: true,
      rootTagsByVersionId: new Map([[101, ["release-1"]]]),
      changes: {
        deletedTags: 1,
        deletedImages: 1,
        deletedIndexes: 0,
        deletedMultiArchManifests: 0,
        deletedArtifactManifests: 0,
        deletedAttestations: 0,
        deletedSignatures: 0,
        deletedTotal: 1
      }
    }
  );

  assert.deepEqual(summary.directTargetTags, ["release-1"]);
  assert.deepEqual(summary.affectedManifests, [{ digest: "sha256:fully", manifestKind: ManifestKinds.imageManifest }]);
});
