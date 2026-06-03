export const _LIST_BLOCKED_ROOTS_SQL = `
  WITH selected_graphs AS (
    SELECT DISTINCT
      manifest_graphs.graph_id
    FROM temp_direct_target_roots dtr
    CROSS JOIN manifest_graphs
    WHERE manifest_graphs.scan_id = ?
      AND manifest_graphs.digest = dtr.root_digest
  ),
  retained_tagged_manifests AS (
    SELECT
      m.version_id AS tagged_version_id,
      m.digest AS tagged_digest
    FROM selected_graphs
    CROSS JOIN manifest_graphs
    CROSS JOIN manifests m
    JOIN tags t
      ON t.scan_id = m.scan_id
     AND t.version_id = m.version_id
     AND t.is_digest_tag = 0
    WHERE manifest_graphs.scan_id = m.scan_id
      AND selected_graphs.graph_id = manifest_graphs.graph_id
      AND manifest_graphs.digest = m.digest
      AND m.scan_id = ?
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
