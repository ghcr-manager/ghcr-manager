import { ManifestKinds } from "../core/index.js";
import { buildCleanupSummary } from "../cleanup-summary/index.js";
import { CleanupRunWriter, openDatabase, PlannerRepository } from "../db/index.js";
import { executeDeletePlan } from "../execute/index.js";
import { hasFlag, resolveLogLevel, resolveToken } from "./_args.js";
import { writeJsonOutput } from "./_json-output.js";
import { createLogger } from "./_logger.js";
import { loadDeletePlan, resolvePlanCommandInputs } from "./_planner-options.js";
import { resolveTagSelectors } from "./_tag-selector-resolver.js";

export async function handleCleanup(args: string[]): Promise<number> {
  const inputs = resolvePlanCommandInputs(args);
  const dryRun = hasFlag(args, "--dry-run");
  const token = dryRun ? undefined : resolveToken(args);
  const logger = createLogger(resolveLogLevel(args));
  const database = openDatabase(inputs.databasePath);
  try {
    const repository = new PlannerRepository(database, logger);
    const cleanupRunWriter = new CleanupRunWriter(database);
    const scanId = repository.getLatestCompletedScanId(inputs.owner, inputs.packageName);
    logger.debug(`Starting cleanup for ${inputs.owner}/${inputs.packageName}`);
    const plan = loadDeletePlan(repository, resolveTagSelectors(database, inputs));
    const rootTagsByVersionId = _loadRootTagsByVersionId(
      database,
      inputs.owner,
      inputs.packageName,
      plan.rootDecisions.map((decision) => decision.versionId)
    );
    const cleanupRunId = cleanupRunWriter.persistCleanupRun(scanId, plan, {
      dryRun,
      cleanupStartedAt: new Date().toISOString()
    });
    if (dryRun) {
      const summary = buildCleanupSummary(plan, {
        dryRun: true,
        rootTagsByVersionId,
        changes: _loadSummaryChanges(database, cleanupRunId)
      });
      logger.debug(`Completed dry-run cleanup for ${inputs.owner}/${inputs.packageName}`);
      writeJsonOutput(args, "--summary-json-path", summary);
      return 0;
    }

    const executionSummary = await executeDeletePlan(plan, {
      token: token as string,
      logger,
      listRootTags: (root) => _listRootTags(database, root.owner, root.packageName, root.versionId)
    });
    const summary = buildCleanupSummary(plan, {
      dryRun: false,
      rootTagsByVersionId,
      changes: _loadSummaryChanges(database, cleanupRunId),
      executionSummary
    });
    logger.debug(`Completed cleanup for ${inputs.owner}/${inputs.packageName}`);
    writeJsonOutput(args, "--summary-json-path", summary);
    return 0;
  } finally {
    database.close();
  }
}

function _listRootTags(
  database: ReturnType<typeof openDatabase>,
  owner: string,
  packageName: string,
  versionId: number
): string[] {
  const rows = database
    .prepare(
      `
        SELECT tags.tag
        FROM tags
        INNER JOIN v_latest_scan_per_package latest_scan ON latest_scan.scan_id = tags.scan_id
        WHERE latest_scan.owner = ?
          AND latest_scan.package_name = ?
          AND tags.version_id = ?
          AND tags.is_digest_tag = 0
        ORDER BY tags.tag
      `
    )
    .all(owner, packageName, versionId) as Array<{ tag: string }>;

  return rows.map((row) => row.tag);
}

function _loadRootTagsByVersionId(
  database: ReturnType<typeof openDatabase>,
  owner: string,
  packageName: string,
  versionIds: number[]
): Map<number, string[]> {
  const requestedVersionIds = new Set(versionIds);
  const tagsByVersionId = new Map<number, string[]>();

  for (const versionId of requestedVersionIds) {
    tagsByVersionId.set(versionId, []);
  }

  if (requestedVersionIds.size === 0) {
    return tagsByVersionId;
  }

  const rows = database
    .prepare(
      `
        SELECT tags.version_id, tags.tag
        FROM tags
        INNER JOIN v_latest_scan_per_package latest_scan ON latest_scan.scan_id = tags.scan_id
        WHERE latest_scan.owner = ?
          AND latest_scan.package_name = ?
          AND tags.is_digest_tag = 0
        ORDER BY tags.version_id, tags.tag
      `
    )
    .all(owner, packageName) as Array<{ version_id: number; tag: string }>;

  for (const row of rows) {
    if (!requestedVersionIds.has(row.version_id)) {
      continue;
    }

    tagsByVersionId.get(row.version_id)?.push(row.tag);
  }

  return tagsByVersionId;
}

function _loadSummaryChanges(
  database: ReturnType<typeof openDatabase>,
  cleanupRunId: number
): {
  deletedTags: number;
  deletedImages: number;
  deletedIndexes: number;
  deletedMultiArchManifests: number;
  deletedArtifactManifests: number;
  deletedAttestations: number;
  deletedSignatures: number;
  deletedTotal: number;
} {
  const deletedTags = (
    database
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM cleanup_selected_tags
          WHERE cleanup_run_id = ?
            AND is_deleted = 1
        `
      )
      .get(cleanupRunId) as { count: number }
  ).count;

  const manifestCounts = database
    .prepare(
      `
        WITH fully_deletable_manifests AS (
          SELECT DISTINCT
            reachable.descendant_digest AS digest,
            manifest.manifest_kind
          FROM cleanup_root_decisions decision
          JOIN manifest_reachability reachable
            ON reachable.scan_id = decision.scan_id
           AND reachable.ancestor_digest = decision.digest
          JOIN manifests manifest
            ON manifest.scan_id = reachable.scan_id
           AND manifest.digest = reachable.descendant_digest
          WHERE decision.cleanup_run_id = ?
            AND decision.validation_status = 'fully-deletable'
        )
        SELECT
          manifest_kind,
          COUNT(*) AS count
        FROM fully_deletable_manifests
        GROUP BY manifest_kind
      `
    )
    .all(cleanupRunId) as Array<{ manifest_kind: string | null; count: number }>;

  const countsByKind = new Map(manifestCounts.map((row) => [row.manifest_kind ?? "", row.count]));

  return {
    deletedTags,
    deletedImages: countsByKind.get(ManifestKinds.imageManifest) ?? 0,
    deletedIndexes: countsByKind.get(ManifestKinds.indexManifest) ?? 0,
    deletedMultiArchManifests: countsByKind.get(ManifestKinds.multiArchManifest) ?? 0,
    deletedArtifactManifests: countsByKind.get(ManifestKinds.artifactManifest) ?? 0,
    deletedAttestations: countsByKind.get(ManifestKinds.attestationManifest) ?? 0,
    deletedSignatures: countsByKind.get(ManifestKinds.signatureManifest) ?? 0,
    deletedTotal: manifestCounts.reduce((total, row) => total + row.count, 0)
  };
}
