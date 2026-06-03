export const _LIST_SUPPORTED_UNTAG_ONLY_ROOT_DIGESTS_SQL = `
  WITH selected_graphs AS (
    SELECT DISTINCT
      manifest_graphs.graph_id
    FROM temp_direct_target_roots dtr
    CROSS JOIN manifest_graphs
    WHERE manifest_graphs.scan_id = ?
      AND manifest_graphs.digest = dtr.root_digest
  ),
  retained_tagged_manifests AS (
    SELECT DISTINCT
      m.digest
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
  retained_manifests AS (
    SELECT
      retained.digest
    FROM retained_tagged_manifests retained

    UNION

    SELECT
      mr.descendant_digest AS digest
    FROM retained_tagged_manifests retained
    CROSS JOIN manifest_reachability mr
    WHERE mr.scan_id = ?
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
