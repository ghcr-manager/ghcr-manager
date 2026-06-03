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
    const sql = `
      WITH selected_graphs AS (
        SELECT DISTINCT
          manifest_graphs.graph_id
        FROM temp_direct_target_roots dtr
        JOIN manifest_graphs
          ON manifest_graphs.scan_id = ?
         AND manifest_graphs.digest = dtr.root_digest
      ),
      retained_tagged_manifests AS (
        SELECT DISTINCT
          m.digest
        FROM manifests m
        JOIN manifest_graphs
          ON manifest_graphs.scan_id = m.scan_id
         AND manifest_graphs.digest = m.digest
        JOIN selected_graphs
          ON selected_graphs.graph_id = manifest_graphs.graph_id
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
          retained.digest
        FROM retained_tagged_manifests retained

        UNION

        SELECT
          mr.descendant_digest AS digest
        FROM retained_tagged_manifests retained
        JOIN manifest_reachability mr
          ON mr.scan_id = ?
         AND mr.ancestor_digest = retained.digest
         AND mr.min_distance > 0
      )
      SELECT DISTINCT
        dtr.root_digest
      FROM temp_direct_target_roots dtr
      WHERE dtr.root_manifest_kind = 'index_manifest'
        AND EXISTS (
          SELECT 1
          FROM manifest_edges me
          JOIN manifests child
            ON child.scan_id = ?
           AND child.digest = me.child_digest
          WHERE me.scan_id = ?
            AND me.parent_digest = dtr.root_digest
            AND me.edge_kind = 'referrer'
            AND child.manifest_kind = 'signature_manifest'
        )
        AND EXISTS (
          SELECT 1
          FROM manifest_edges me
          JOIN manifests child
            ON child.scan_id = ?
           AND child.digest = me.child_digest
          WHERE me.scan_id = ?
            AND me.parent_digest = dtr.root_digest
            AND me.edge_kind = 'image-child'
            AND child.manifest_kind <> 'signature_manifest'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM manifest_edges me
          JOIN manifests child
            ON child.scan_id = ?
           AND child.digest = me.child_digest
          WHERE me.scan_id = ?
            AND me.parent_digest = dtr.root_digest
            AND me.edge_kind = 'image-child'
            AND child.manifest_kind <> 'signature_manifest'
            AND child.digest NOT IN (
              SELECT digest
              FROM retained_manifests
            )
        )
    `;

    const rows = this.#sql.all<{ root_digest: string }>(sql, [
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
    const sql = `
      WITH selected_graphs AS (
        SELECT DISTINCT
          manifest_graphs.graph_id
        FROM temp_direct_target_roots dtr
        JOIN manifest_graphs
          ON manifest_graphs.scan_id = ?
         AND manifest_graphs.digest = dtr.root_digest
      ),
      retained_tagged_manifests AS (
        SELECT DISTINCT
          m.version_id,
          m.digest
        FROM manifests m
        JOIN manifest_graphs
          ON manifest_graphs.scan_id = m.scan_id
         AND manifest_graphs.digest = m.digest
        JOIN selected_graphs
          ON selected_graphs.graph_id = manifest_graphs.graph_id
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
          0 AS hops_from_root
        FROM temp_direct_target_roots dtr

        UNION ALL

        SELECT
          dtr.root_version_id AS source_version_id,
          dtr.root_digest AS source_digest,
          m.version_id AS member_version_id,
          m.digest AS member_digest,
          m.manifest_kind AS member_manifest_kind,
          mr.min_distance AS hops_from_root
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
          dtc.member_digest,
          dtc.hops_from_root
        FROM direct_target_closure dtc
        WHERE dtc.hops_from_root = 0
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
        JOIN manifest_graphs parent_graph
          ON parent_graph.scan_id = me.scan_id
         AND parent_graph.digest = me.parent_digest
        JOIN selected_graphs
          ON selected_graphs.graph_id = parent_graph.graph_id
        WHERE me.scan_id = ?

        UNION

        SELECT
          me.child_digest AS source_digest,
          me.parent_digest AS target_digest
        FROM manifest_edges me
        JOIN manifest_graphs child_graph
          ON child_graph.scan_id = me.scan_id
         AND child_graph.digest = me.child_digest
        JOIN selected_graphs
          ON selected_graphs.graph_id = child_graph.graph_id
        WHERE me.scan_id = ?
      ),
      delete_component_members AS (
        SELECT
          seed.source_version_id,
          seed.source_digest,
          seed.member_digest
        FROM closure_seed seed

        UNION

        SELECT
          walk.source_version_id,
          walk.source_digest,
          m.digest AS member_digest
        FROM delete_component_members walk
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
      ),
      source_seed_hops AS (
        SELECT
          seed.source_digest,
          MAX(seed.hops_from_root) AS max_seed_hops
        FROM closure_seed seed
        GROUP BY seed.source_digest
      ),
      descendant_hops AS (
        SELECT
          dtc.source_digest,
          dtc.member_digest,
          MIN(dtc.hops_from_root) AS min_hops_from_root
        FROM direct_target_closure dtc
        WHERE dtc.hops_from_root > 0
        GROUP BY dtc.source_digest, dtc.member_digest
      )
      SELECT
        walk.source_version_id,
        walk.source_digest,
        MIN(member_manifest.version_id) AS member_version_id,
        walk.member_digest,
        MIN(member_manifest.manifest_kind) AS member_manifest_kind,
        CASE
          WHEN walk.member_digest = walk.source_digest
            THEN 0
          WHEN descendant_hops.min_hops_from_root IS NOT NULL
            THEN descendant_hops.min_hops_from_root
          ELSE source_seed_hops.max_seed_hops + 1
        END AS hops_from_root,
        CASE
          WHEN walk.member_digest = walk.source_digest
            THEN 'root'
          WHEN descendant_hops.min_hops_from_root IS NOT NULL
            THEN 'descendant'
          ELSE 'connected'
        END AS member_role
      FROM delete_component_members walk
      JOIN manifests member_manifest
        ON member_manifest.scan_id = ?
       AND member_manifest.digest = walk.member_digest
      JOIN source_seed_hops
        ON source_seed_hops.source_digest = walk.source_digest
      LEFT JOIN descendant_hops
        ON descendant_hops.source_digest = walk.source_digest
       AND descendant_hops.member_digest = walk.member_digest
      GROUP BY
        walk.source_version_id,
        walk.source_digest,
        walk.member_digest,
        descendant_hops.min_hops_from_root,
        source_seed_hops.max_seed_hops
      ORDER BY walk.source_digest, hops_from_root, walk.member_digest
    `;
    return this.#sql
      .all<
        Parameters<typeof mapClosureManifestRow>[0]
      >(sql, [scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId, scanId])
      .map(mapClosureManifestRow);
  }

  #listBlockedRoots(scanId: number) {
    const sql = `
      WITH selected_graphs AS (
        SELECT DISTINCT
          manifest_graphs.graph_id
        FROM temp_direct_target_roots dtr
        JOIN manifest_graphs
          ON manifest_graphs.scan_id = ?
         AND manifest_graphs.digest = dtr.root_digest
      ),
      retained_tagged_manifests AS (
        SELECT
          m.version_id AS tagged_version_id,
          m.digest AS tagged_digest
        FROM manifests m
        JOIN manifest_graphs
          ON manifest_graphs.scan_id = m.scan_id
         AND manifest_graphs.digest = m.digest
        JOIN selected_graphs
          ON selected_graphs.graph_id = manifest_graphs.graph_id
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
    return this.#sql.all<Parameters<typeof mapBlockedRootRow>[0]>(sql, [scanId, scanId, scanId]).map(mapBlockedRootRow);
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
