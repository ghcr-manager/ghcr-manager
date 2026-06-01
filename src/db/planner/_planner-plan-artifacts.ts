import { PlannerSql } from "./_planner-sql.js";
import { mapBlockedRootRow, mapClosureManifestRow, type DeletePlanRoot, type PlanArtifacts } from "./_planner-types.js";

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
        fullyDeletableRoots: []
      };
    }

    return this.#withDirectTargetRootsTempTable(deleteRootCandidates, () => {
      const closureManifests = this.#listClosureManifests(scanId);
      const blockedRoots = this.#listBlockedRoots(scanId);
      const blockedVersionIds = new Set(blockedRoots.map((root) => root.blockedVersionId));
      const fullyDeletableRoots = deleteRootCandidates.filter((root) => !blockedVersionIds.has(root.versionId));

      return {
        closureManifests,
        blockedRoots,
        fullyDeletableRoots
      };
    });
  }

  #listClosureManifests(scanId: number) {
    const sql = `
      WITH retained_tagged_manifests AS (
        SELECT DISTINCT
          m.version_id,
          m.digest
        FROM manifests m
        JOIN tags t
          ON t.scan_id = m.scan_id
         AND t.version_id = m.version_id
         AND t.is_digest_tag = 0
        WHERE m.scan_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM temp_direct_target_roots dtr
            WHERE dtr.root_digest = m.digest
          )
      ),
      retained_manifests AS (
        SELECT
          retained.version_id,
          retained.digest
        FROM retained_tagged_manifests retained

        UNION

        SELECT
          m.version_id,
          m.digest
        FROM retained_tagged_manifests retained
        JOIN manifest_reachability mr
          ON mr.scan_id = ?
         AND mr.ancestor_digest = retained.digest
         AND mr.min_distance > 0
        JOIN manifests m
          ON m.scan_id = ?
         AND m.digest = mr.descendant_digest
      ),
      direct_target_closure AS (
        SELECT
          dtr.root_version_id AS source_version_id,
          dtr.root_digest AS source_digest,
          dtr.root_version_id AS member_version_id,
          dtr.root_digest AS member_digest,
          dtr.root_manifest_kind AS member_manifest_kind,
          0 AS hops_from_root,
          'root' AS member_role
        FROM temp_direct_target_roots dtr

        UNION ALL

        SELECT
          dtr.root_version_id AS source_version_id,
          dtr.root_digest AS source_digest,
          m.version_id AS member_version_id,
          m.digest AS member_digest,
          m.manifest_kind AS member_manifest_kind,
          mr.min_distance AS hops_from_root,
          'descendant' AS member_role
        FROM temp_direct_target_roots dtr
        JOIN manifest_reachability mr
          ON mr.scan_id = ?
         AND mr.ancestor_digest = dtr.root_digest
         AND mr.min_distance > 0
        JOIN manifests m
          ON m.scan_id = ?
         AND m.digest = mr.descendant_digest
      ),
      closure_seed AS (
        SELECT
          dtc.source_version_id,
          dtc.source_digest,
          dtc.member_version_id,
          dtc.member_digest,
          dtc.member_manifest_kind,
          dtc.hops_from_root,
          dtc.member_role
        FROM direct_target_closure dtc
        WHERE dtc.member_role = 'root'
           OR NOT EXISTS (
             SELECT 1
             FROM retained_manifests retained
             WHERE retained.digest = dtc.member_digest
           )
      ),
      undirected_edges AS (
        SELECT
          me.parent_digest AS source_digest,
          me.child_digest AS target_digest
        FROM manifest_edges me
        WHERE me.scan_id = ?

        UNION

        SELECT
          me.child_digest AS source_digest,
          me.parent_digest AS target_digest
        FROM manifest_edges me
        WHERE me.scan_id = ?
      ),
      raw_delete_component AS (
        SELECT
          seed.source_version_id,
          seed.source_digest,
          seed.member_version_id,
          seed.member_digest,
          seed.member_manifest_kind,
          seed.hops_from_root,
          seed.member_role,
          '|' || seed.member_digest || '|' AS path
        FROM closure_seed seed

        UNION ALL

        SELECT
          walk.source_version_id,
          walk.source_digest,
          m.version_id AS member_version_id,
          m.digest AS member_digest,
          m.manifest_kind AS member_manifest_kind,
          walk.hops_from_root + 1 AS hops_from_root,
          'connected' AS member_role,
          walk.path || m.digest || '|' AS path
        FROM raw_delete_component walk
        JOIN undirected_edges edge
          ON edge.source_digest = walk.member_digest
        JOIN manifests m
          ON m.scan_id = ?
         AND m.digest = edge.target_digest
        WHERE NOT EXISTS (
            SELECT 1
            FROM retained_manifests retained
            WHERE retained.digest = m.digest
          )
          AND instr(walk.path, '|' || m.digest || '|') = 0
      )
      SELECT
        walk.source_version_id,
        walk.source_digest,
        MIN(walk.member_version_id) AS member_version_id,
        walk.member_digest,
        MIN(walk.member_manifest_kind) AS member_manifest_kind,
        MIN(walk.hops_from_root) AS hops_from_root,
        CASE
          WHEN walk.member_digest = walk.source_digest
            THEN 'root'
          WHEN EXISTS (
            SELECT 1
            FROM direct_target_closure seed
            WHERE seed.source_digest = walk.source_digest
              AND seed.member_digest = walk.member_digest
              AND seed.member_role = 'descendant'
          )
            THEN 'descendant'
          ELSE 'connected'
        END AS member_role
      FROM raw_delete_component walk
      GROUP BY walk.source_version_id, walk.source_digest, walk.member_digest
      ORDER BY walk.source_digest, hops_from_root, walk.member_digest
    `;
    return this.#sql
      .all<
        Parameters<typeof mapClosureManifestRow>[0]
      >(sql, [scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId])
      .map(mapClosureManifestRow);
  }

  #listBlockedRoots(scanId: number) {
    const sql = `
      WITH retained_tagged_manifests AS (
        SELECT
          m.version_id AS tagged_version_id,
          m.digest AS tagged_digest
        FROM manifests m
        JOIN tags t
          ON t.scan_id = m.scan_id
         AND t.version_id = m.version_id
         AND t.is_digest_tag = 0
        WHERE m.scan_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM temp_direct_target_roots dtr
            WHERE dtr.root_digest = m.digest
          )
      ),
      ranked_blocks AS (
        SELECT
          dtr.root_version_id AS blocked_version_id,
          dtr.root_digest AS blocked_digest,
          retained.tagged_version_id AS blocking_version_id,
          retained.tagged_digest AS blocking_digest,
          dtr.root_digest AS overlap_digest,
          dtr.root_manifest_kind AS overlap_manifest_kind,
          'overlap-with-retained-root' AS block_reason,
          ROW_NUMBER() OVER (
            PARTITION BY dtr.root_digest, retained.tagged_digest
            ORDER BY
              retained_overlap.min_distance,
              dtr.root_digest
          ) AS rn
        FROM temp_direct_target_roots dtr
        JOIN retained_tagged_manifests retained
          ON retained.tagged_digest <> dtr.root_digest
        JOIN manifest_reachability retained_overlap
          ON retained_overlap.scan_id = ?
         AND retained_overlap.ancestor_digest = retained.tagged_digest
         AND retained_overlap.descendant_digest = dtr.root_digest
      )
      SELECT
        blocked_version_id,
        blocked_digest,
        blocking_version_id,
        blocking_digest,
        overlap_digest,
        overlap_manifest_kind,
        block_reason
      FROM ranked_blocks
      WHERE rn = 1
      ORDER BY blocked_digest, blocking_digest, overlap_digest
    `;
    return this.#sql.all<Parameters<typeof mapBlockedRootRow>[0]>(sql, [scanId, scanId]).map(mapBlockedRootRow);
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
