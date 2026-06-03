import { DeletePlanValidationStatuses, type DeletePlan } from "../db/index.js";
import { deletePackageVersion } from "./_package-version-delete-client.js";
import { untagRootTags } from "./_untag-client.js";
import { type DeleteExecutionOptions, type DeleteExecutionSummary } from "./_types.js";

export async function executeDeletePlan(
  plan: DeletePlan,
  options: DeleteExecutionOptions
): Promise<DeleteExecutionSummary> {
  let deletedPackageVersionCount = 0;
  let detachedTagCount = 0;
  const directTargetTagSet = new Set(plan.directTargetTags);
  const deletedVersionIds = new Set<number>();

  for (const decision of plan.rootDecisions) {
    if (decision.validationStatus !== DeletePlanValidationStatuses.untagOnly) {
      continue;
    }
    if (!options.listRootTags) {
      throw new Error(`execution requires listRootTags support for untag-only root ${decision.digest}`);
    }

    const selectedTags = options
      .listRootTags({
        owner: plan.owner,
        packageName: plan.packageName,
        versionId: decision.versionId,
        digest: decision.digest
      })
      .filter((tag) => directTargetTagSet.has(tag));
    if (selectedTags.length === 0) {
      throw new Error(`no selected tags resolved for untag-only root ${decision.digest}`);
    }

    detachedTagCount += await untagRootTags(
      plan.owner,
      plan.packageName,
      decision.versionId,
      decision.digest,
      selectedTags,
      options
    );
  }

  const closureMembersByRootDigest = new Map(
    plan.fullyDeletableRoots.map((root) => [
      root.digest,
      plan.closureManifests
        .filter((manifest) => manifest.sourceDigest === root.digest)
        .sort((left, right) => {
          if (left.hopsFromRoot !== right.hopsFromRoot) {
            return right.hopsFromRoot - left.hopsFromRoot;
          }
          return left.memberVersionId - right.memberVersionId;
        })
    ])
  );

  for (const root of plan.fullyDeletableRoots) {
    const closureMembers = closureMembersByRootDigest.get(root.digest) ?? [];
    const deleteTargets =
      closureMembers.length > 0
        ? closureMembers.map((member) => ({
            versionId: member.memberVersionId,
            digest: member.memberDigest
          }))
        : [{ versionId: root.versionId, digest: root.digest }];

    for (const target of deleteTargets) {
      if (deletedVersionIds.has(target.versionId)) {
        continue;
      }

      options.logger.info(
        `Deleting package version ${target.versionId} for ${plan.owner}/${plan.packageName} (${target.digest})`
      );
      await deletePackageVersion(plan.owner, plan.packageName, target.versionId, options.token, options.logger, {
        fetchImpl: options.fetchImpl
      });
      deletedVersionIds.add(target.versionId);
      deletedPackageVersionCount += 1;
    }
  }

  return {
    owner: plan.owner,
    packageName: plan.packageName,
    scanCompletedAt: plan.scanCompletedAt,
    plannerInputs: plan.plannerInputs,
    deletedPackageVersionCount,
    detachedTagCount,
    blockedRoots: plan.blockedRoots
  };
}
