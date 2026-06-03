import { PlannerSql } from "./_planner-sql.js";
import { mapBlockedRootRow, mapClosureManifestRow, type DeletePlanRoot, type PlanArtifacts } from "./_planner-types.js";
import { _LIST_BLOCKED_ROOTS_SQL } from "./_planner-plan-artifacts-blocked-roots-sql.js";
import { _LIST_CLOSURE_MANIFESTS_SQL } from "./_planner-plan-artifacts-closure-sql.js";
import { _LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL } from "./_planner-plan-artifacts-supported-untag-only-sql.js";

export class PlannerPlanArtifacts {
  readonly #sql: PlannerSql;

  constructor(sql: PlannerSql) {
    this.#sql = sql;
  }

  build(scanId: number, directTargetRoots: DeletePlanRoot[]): PlanArtifacts {
    const deleteRootCandidates = directTargetRoots.filter((root) => root.selectionMode === "delete-root");
    if (deleteRootCandidates.length === 0) {
      return {
        closureManifests: [],
        blockedRoots: [],
        fullyDeletableRoots: [],
        supportedUntagOnlyRootDigests: new Set()
      };
    }

    return this.#withDirectTargetRootsTempTable(deleteRootCandidates, () => {
      const closureManifests = this.#listClosureManifests(scanId);
      const blockedRoots = this.#listBlockedRoots(scanId);
      const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
      const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));
      const supportedUntagOnlyRootDigests = this.#listSupportedUntagOnlyRootDigests(scanId);

      return {
        closureManifests,
        blockedRoots,
        fullyDeletableRoots,
        supportedUntagOnlyRootDigests
      };
    });
  }

  #listSupportedUntagOnlyRootDigests(scanId: number) {
    const rows = this.#sql.all<{ root_digest: string }>(_LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL, [
      scanId,
      scanId,
      scanId,
      scanId,
      scanId,
      scanId,
      scanId,
      scanId,
      scanId
    ]);

    return new Set(rows.map((row) => row.root_digest));
  }

  #listClosureManifests(scanId: number) {
    return this.#sql
      .all<
        Parameters<typeof mapClosureManifestRow>[0]
      >(_LIST_CLOSURE_MANIFESTS_SQL, [scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId])
      .map(mapClosureManifestRow);
  }

  #listBlockedRoots(scanId: number) {
    return this.#sql
      .all<Parameters<typeof mapBlockedRootRow>[0]>(_LIST_BLOCKED_ROOTS_SQL, [scanId, scanId, scanId])
      .map(mapBlockedRootRow);
  }

  #withDirectTargetRootsTempTable<T>(directTargetRoots: DeletePlanRoot[], callback: () => T): T {
    this.#sql.exec(`
      CREATE TEMP TABLE IF NOT EXISTS temp_direct_target_roots (
        root_version_id INTEGER NOT NULL,
        root_digest TEXT NOT NULL,
        root_manifest_kind TEXT,
        direct_target_reason TEXT NOT NULL,
        selection_mode TEXT NOT NULL
      )
    `);
    this.#sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_temp_direct_target_roots_digest
        ON temp_direct_target_roots(root_digest)
    `);
    this.#sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_temp_direct_target_roots_version_digest
        ON temp_direct_target_roots(root_version_id, root_digest)
    `);
    this.#sql.exec("DELETE FROM temp_direct_target_roots");
    this.#insertDirectTargetRoots(directTargetRoots);

    try {
      return callback();
    } finally {
      this.#sql.exec("DELETE FROM temp_direct_target_roots");
    }
  }

  #insertDirectTargetRoots(directTargetRoots: DeletePlanRoot[]): void {
    const insertSql = `
      INSERT INTO temp_direct_target_roots (
        root_version_id,
        root_digest,
        root_manifest_kind,
        direct_target_reason,
        selection_mode
      ) VALUES (?, ?, ?, ?, ?)
    `;
    this.#sql.traceSql(insertSql, ["<chunked rows omitted>"]);
    const insert = this.#sql.database.prepare(insertSql);
    const insertMany = this.#sql.database.transaction((roots: DeletePlanRoot[]) => {
      for (const root of roots) {
        insert.run(root.versionId, root.digest, root.manifestKind ?? null, root.reason, root.selectionMode);
      }
    });

    const chunkSize = 1000;
    for (let index = 0; index < directTargetRoots.length; index += chunkSize) {
      const chunk = directTargetRoots.slice(index, index + chunkSize);
      insertMany(chunk);
      this.#sql.logger.debug(`Inserted ${chunk.length} direct target root row(s) into temp_direct_target_roots`);
    }
  }
}
