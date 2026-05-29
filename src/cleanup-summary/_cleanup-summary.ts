import type { ManifestKind } from "../core/index.js";
import { DeletePlanValidationStatuses } from "../db/index.js";
import type {
  DeletePlan,
  DeletePlanSelectionMode,
  DeletePlanSelectionReason,
  DeletePlanValidationReasonCode,
  DeletePlanValidationStatus
} from "../db/index.js";
import type { DeleteExecutionSummary } from "../execute/index.js";

export interface CleanupSummaryRoot {
  versionId: number;
  digest: string;
  manifestKind?: ManifestKind;
  rootTags: string[];
  matchedTags: string[];
  selectionMode: DeletePlanSelectionMode;
  selectionReason: DeletePlanSelectionReason;
  validationStatus: DeletePlanValidationStatus;
  validationReasonCode: DeletePlanValidationReasonCode;
  validationReason: string;
  blockingVersionId?: number;
  blockingDigest?: string;
  overlapDigest?: string;
  overlapManifestKind?: ManifestKind;
}

export interface CleanupSummaryAffectedManifest {
  digest: string;
  manifestKind?: ManifestKind;
}

export interface CleanupSummaryChanges {
  deletedTags: number;
  deletedImages: number;
  deletedIndexes: number;
  deletedMultiArchManifests: number;
  deletedArtifactManifests: number;
  deletedAttestations: number;
  deletedSignatures: number;
  deletedTotal: number;
}

export interface CleanupSummary {
  command: "cleanup";
  owner: string;
  packageName: string;
  scanCompletedAt: string;
  dryRun: boolean;
  plannerInputs: DeletePlan["plannerInputs"];
  directTargetTags: string[];
  collateralTags: string[];
  fullyDeletableRoots: CleanupSummaryRoot[];
  untagOnlyRoots: CleanupSummaryRoot[];
  blockedRoots: CleanupSummaryRoot[];
  affectedManifests: CleanupSummaryAffectedManifest[];
  changes: CleanupSummaryChanges;
  deletedPackageVersionCount: DeleteExecutionSummary["deletedPackageVersionCount"];
  detachedTagCount: DeleteExecutionSummary["detachedTagCount"];
}

export function buildCleanupSummary(
  plan: DeletePlan,
  options: {
    dryRun: boolean;
    rootTagsByVersionId: ReadonlyMap<number, string[]>;
    changes: CleanupSummaryChanges;
    executionSummary?: DeleteExecutionSummary;
  }
): CleanupSummary {
  const directTargetTagSet = new Set(plan.directTargetTags);
  const roots = plan.rootDecisions.map((decision) =>
    _mapRootDecision(decision, directTargetTagSet, options.rootTagsByVersionId)
  );
  const fullyDeletableRoots = roots.filter(
    (root) => root.validationStatus === DeletePlanValidationStatuses.fullyDeletable
  );
  const blockedRoots = roots.filter((root) => root.validationStatus === DeletePlanValidationStatuses.blocked);
  const untagOnlyRoots = roots.filter((root) => root.validationStatus === DeletePlanValidationStatuses.untagOnly);
  const affectedManifests = _listAffectedManifests(
    plan,
    fullyDeletableRoots.map((root) => root.digest)
  );

  return {
    command: "cleanup",
    owner: plan.owner,
    packageName: plan.packageName,
    scanCompletedAt: plan.scanCompletedAt,
    dryRun: options.dryRun,
    plannerInputs: plan.plannerInputs,
    directTargetTags: plan.directTargetTags,
    collateralTags: plan.collateralTags,
    fullyDeletableRoots,
    untagOnlyRoots,
    blockedRoots,
    affectedManifests,
    changes: options.changes,
    deletedPackageVersionCount: options.executionSummary?.deletedPackageVersionCount ?? 0,
    detachedTagCount: options.executionSummary?.detachedTagCount ?? 0
  };
}

function _mapRootDecision(
  decision: DeletePlan["rootDecisions"][number],
  directTargetTagSet: Set<string>,
  rootTagsByVersionId: ReadonlyMap<number, string[]>
): CleanupSummaryRoot {
  const rootTags = rootTagsByVersionId.get(decision.versionId) ?? [];

  return {
    versionId: decision.versionId,
    digest: decision.digest,
    manifestKind: decision.manifestKind,
    rootTags,
    matchedTags: rootTags.filter((tag) => directTargetTagSet.has(tag)),
    selectionMode: decision.selectionMode,
    selectionReason: decision.selectionReason,
    validationStatus: decision.validationStatus,
    validationReasonCode: decision.validationReasonCode,
    validationReason: decision.validationReason,
    blockingVersionId: decision.blockingVersionId,
    blockingDigest: decision.blockingDigest,
    overlapDigest: decision.overlapDigest,
    overlapManifestKind: decision.overlapManifestKind
  };
}

function _listAffectedManifests(
  plan: DeletePlan,
  fullyDeletableRootDigests: string[]
): CleanupSummaryAffectedManifest[] {
  const fullyDeletableRootDigestSet = new Set(fullyDeletableRootDigests);
  const manifestsByDigest = new Map<string, CleanupSummaryAffectedManifest>();

  for (const manifest of plan.closureManifests) {
    if (!fullyDeletableRootDigestSet.has(manifest.sourceDigest)) {
      continue;
    }

    manifestsByDigest.set(manifest.memberDigest, {
      digest: manifest.memberDigest,
      manifestKind: manifest.memberManifestKind as ManifestKind | undefined
    });
  }

  return [...manifestsByDigest.values()].sort((left, right) => left.digest.localeCompare(right.digest));
}
