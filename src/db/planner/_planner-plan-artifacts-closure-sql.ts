export const _LIST_CLOSURE_MANIFESTS_SQL = `
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
      m.version_id,
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
      retained.version_id,
      retained.digest
    FROM retained_tagged_manifests retained

    UNION

    SELECT
      m.version_id,
      m.digest
    FROM retained_tagged_manifests retained
    CROSS JOIN manifest_reachability mr
    CROSS JOIN manifests m
    WHERE mr.scan_id = ?
      AND mr.ancestor_digest = retained.digest
      AND mr.min_distance > 0
      AND m.scan_id = ?
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
    CROSS JOIN manifest_reachability mr
    CROSS JOIN manifests m
    WHERE mr.scan_id = ?
      AND mr.ancestor_digest = dtr.root_digest
      AND mr.min_distance > 0
      AND m.scan_id = ?
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
    FROM selected_graphs
    CROSS JOIN manifest_graphs parent_graph
    CROSS JOIN manifest_edges me INDEXED BY idx_manifest_edges_scan_parent
    WHERE parent_graph.scan_id = me.scan_id
      AND selected_graphs.graph_id = parent_graph.graph_id
      AND parent_graph.digest = me.parent_digest
      AND me.scan_id = ?

    UNION

    SELECT
      me.child_digest AS source_digest,
      me.parent_digest AS target_digest
    FROM selected_graphs
    CROSS JOIN manifest_graphs child_graph
    CROSS JOIN manifest_edges me INDEXED BY idx_manifest_edges_scan_child
    WHERE child_graph.scan_id = me.scan_id
      AND selected_graphs.graph_id = child_graph.graph_id
      AND child_graph.digest = me.child_digest
      AND me.scan_id = ?
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
