import type { DirectTargetRootOptions } from "./_planner-direct-target-root-options.js";

export interface CombinedDirectTargetRootsQuery {
  query: string;
  baseParams: Array<number | string>;
  tailParams: Array<number | string>;
}

export function buildCombinedDirectTargetRootsQuery(
  scanId: number,
  options: DirectTargetRootOptions,
  selectedTagsSql: string,
  excludedVersionsSql: string
): CombinedDirectTargetRootsQuery {
  const baseParams: Array<number | string> = [scanId];
  const cutoffSql = options.cutoffTimestamp ? "AND created_at < ?" : "";
  if (options.cutoffTimestamp) {
    baseParams.push(options.cutoffTimestamp);
  }

  const taggedBranchEnabled = options.deleteTagsRequested || options.keepNTagged !== undefined ? 1 : 0;
  const deleteTagsRequested = options.deleteTagsRequested ? 1 : 0;
  const deleteOrphanedImages = options.deleteOrphanedImages ? 1 : 0;
  const keepNTaggedActive = options.keepNTagged !== undefined ? 1 : 0;
  const deleteUntagged = options.deleteUntagged ? 1 : 0;
  const keepNUntaggedActive = options.keepNUntagged !== undefined ? 1 : 0;
  const tailParams: Array<number | string> = [
    deleteOrphanedImages,
    deleteOrphanedImages,
    taggedBranchEnabled,
    deleteTagsRequested,
    deleteTagsRequested,
    keepNTaggedActive,
    deleteTagsRequested,
    keepNTaggedActive,
    options.keepNTagged ?? 0,
    deleteUntagged,
    keepNUntaggedActive,
    deleteUntagged,
    deleteUntagged,
    keepNUntaggedActive,
    options.keepNUntagged ?? 0
  ];

  const query = `
    WITH base_manifests AS (
      SELECT
        m.version_id,
        m.digest AS root_digest,
        m.manifest_kind AS root_manifest_kind,
        pv.created_at
      FROM manifests m
      JOIN package_versions pv
        ON pv.scan_id = m.scan_id
       AND pv.version_id = m.version_id
      WHERE m.scan_id = ?
        ${cutoffSql}
    ),
    tag_counts AS (
      SELECT
        t.version_id,
        COUNT(t.tag) AS tag_count
      FROM tags t
      WHERE t.scan_id = ?
        AND t.is_digest_tag = 0
      GROUP BY t.version_id
    ),
    parented_digests AS (
      SELECT DISTINCT me.child_digest
      FROM manifest_edges me
      WHERE me.scan_id = ?
        AND me.edge_kind != 'digest-tag-referrer'
    ),
    root_candidates AS (
      SELECT
        bm.version_id,
        bm.root_digest,
        bm.root_manifest_kind,
        bm.created_at,
        COALESCE(tc.tag_count, 0) AS tag_count,
        CASE WHEN COALESCE(tc.tag_count, 0) > 0 THEN 1 ELSE 0 END AS is_tagged,
        CASE WHEN pd.child_digest IS NULL THEN 0 ELSE 1 END AS has_ancestor
      FROM base_manifests bm
      LEFT JOIN tag_counts tc
        ON tc.version_id = bm.version_id
      LEFT JOIN parented_digests pd
        ON pd.child_digest = bm.root_digest
    ),
    selected_tags AS (
      ${selectedTagsSql}
    ),
    excluded_versions AS (
      ${excludedVersionsSql}
    ),
    matched_tag_counts AS (
      SELECT
        st.version_id,
        COUNT(DISTINCT st.tag) AS matched_tag_count
      FROM selected_tags st
      GROUP BY st.version_id
    ),
    eligible_tagged_roots AS (
      SELECT
        rc.version_id,
        rc.root_digest,
        rc.root_manifest_kind,
        rc.created_at,
        CASE
          WHEN ? = 1 AND rc.tag_count = 0 AND COALESCE(mtc.matched_tag_count, 0) > 0
            THEN COALESCE(mtc.matched_tag_count, 0)
          ELSE rc.tag_count
        END AS total_tag_count,
        COALESCE(mtc.matched_tag_count, 0) AS matched_tag_count
      FROM root_candidates rc
      LEFT JOIN matched_tag_counts mtc
        ON mtc.version_id = rc.version_id
      LEFT JOIN excluded_versions ev
        ON ev.version_id = rc.version_id
      WHERE (
          rc.is_tagged = 1
          OR (? = 1 AND COALESCE(mtc.matched_tag_count, 0) > 0)
        )
        AND ev.version_id IS NULL
        AND ? = 1
    ),
    ranked_tagged_roots AS (
      SELECT
        version_id,
        root_digest,
        root_manifest_kind,
        total_tag_count,
        matched_tag_count,
        ROW_NUMBER() OVER (
          ORDER BY created_at DESC, version_id DESC, root_digest DESC
        ) AS recency_rank
      FROM eligible_tagged_roots
      WHERE ? = 0
         OR matched_tag_count > 0
    ),
    final_tagged_targets AS (
      SELECT
        version_id,
        root_digest,
        root_manifest_kind,
        CASE
          WHEN ? = 0
            THEN 'keep-n-tagged-overflow'
          WHEN ? = 1 AND total_tag_count = matched_tag_count
            THEN 'keep-n-tagged-overflow'
          WHEN total_tag_count = matched_tag_count
            THEN 'delete-tags-all-tags-selected'
          ELSE 'delete-tags-partial-tag-match'
        END AS direct_target_reason,
        CASE
          WHEN ? = 0
            THEN 'delete-root'
          WHEN total_tag_count = matched_tag_count
            THEN 'delete-root'
          ELSE 'untag-only'
        END AS selection_mode
      FROM ranked_tagged_roots
      WHERE ? = 0
         OR recency_rank > ?
    ),
    ranked_untagged_roots AS (
      SELECT
        rc.version_id,
        rc.root_digest,
        rc.root_manifest_kind,
        ROW_NUMBER() OVER (
          ORDER BY rc.created_at DESC, rc.version_id DESC, rc.root_digest DESC
        ) AS recency_rank
      FROM root_candidates rc
      WHERE rc.is_tagged = 0
        AND rc.has_ancestor = 0
        AND (? = 1 OR ? = 1)
    ),
    final_untagged_targets AS (
      SELECT
        version_id,
        root_digest,
        root_manifest_kind,
        CASE
          WHEN ? = 1
            THEN 'delete-untagged'
          ELSE 'keep-n-untagged-overflow'
        END AS direct_target_reason,
        'delete-root' AS selection_mode
      FROM ranked_untagged_roots
      WHERE ? = 1
         OR (? = 1 AND recency_rank > ?)
    )
    SELECT
      version_id,
      root_digest,
      root_manifest_kind,
      direct_target_reason,
      selection_mode
    FROM final_tagged_targets

    UNION ALL

    SELECT
      version_id,
      root_digest,
      root_manifest_kind,
      direct_target_reason,
      selection_mode
    FROM final_untagged_targets
    ORDER BY root_digest
  `;

  return { query, baseParams, tailParams };
}
