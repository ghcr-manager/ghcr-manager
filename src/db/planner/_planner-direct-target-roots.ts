import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import { PlannerSql } from "./_planner-sql.js";
import { mapPlanRootRow, type DeletePlanRoot } from "./_planner-types.js";

export interface DirectTargetRootOptions {
  deleteTags: string[];
  deleteTagsRequested: boolean;
  deleteOrphanedImages?: boolean;
  excludeTags: string[];
  deleteUntagged: boolean;
  keepNTagged?: number;
  keepNUntagged?: number;
  useRegex?: boolean;
  cutoffTimestamp?: string;
}

export class PlannerDirectTargetRoots {
  readonly #sql: PlannerSql;

  constructor(sql: PlannerSql) {
    this.#sql = sql;
  }

  list(scanId: number, options: DirectTargetRootOptions): DeletePlanRoot[] {
    const selectedTagPredicate =
      options.deleteTags.length > 0
        ? buildTagSelectorPredicate(this.#sql.database, "t.tag", options.deleteTags, options.useRegex ?? false)
        : undefined;
    const excludedTagPredicate =
      options.excludeTags.length > 0
        ? buildTagSelectorPredicate(this.#sql.database, "xt.tag", options.excludeTags, options.useRegex ?? false)
        : undefined;

    const params: Array<number | string> = [scanId];
    const cutoffSql = options.cutoffTimestamp ? "AND created_at < ?" : "";
    if (options.cutoffTimestamp) {
      params.push(options.cutoffTimestamp);
    }
    const selectedTagDigestFlag = options.deleteOrphanedImages ? 1 : 0;

    const selectedTagsSql = selectedTagPredicate
      ? `
          SELECT DISTINCT t.version_id, t.tag
          FROM tags t
          WHERE t.scan_id = ?
            AND t.is_digest_tag = ?
            AND (${selectedTagPredicate.sql})
        `
      : `
          SELECT NULL AS version_id, NULL AS tag
          WHERE 1 = 0
        `;
    if (selectedTagPredicate) {
      params.push(scanId, selectedTagDigestFlag, ...selectedTagPredicate.params);
    }

    const excludedVersionsSql = excludedTagPredicate
      ? `
        SELECT DISTINCT xt.version_id
        FROM tags xt
        WHERE xt.scan_id = ?
          AND xt.is_digest_tag = 0
          AND (${excludedTagPredicate.sql})
      `
      : `
        SELECT NULL AS version_id
        WHERE 1 = 0
      `;
    if (excludedTagPredicate) {
      params.push(scanId, ...excludedTagPredicate.params);
    }

    const taggedBranchEnabled = options.deleteTagsRequested || options.keepNTagged !== undefined ? 1 : 0;
    const deleteTagsRequested = options.deleteTagsRequested ? 1 : 0;
    const deleteOrphanedImages = options.deleteOrphanedImages ? 1 : 0;
    const keepNTaggedActive = options.keepNTagged !== undefined ? 1 : 0;
    const deleteUntagged = options.deleteUntagged ? 1 : 0;
    const keepNUntaggedActive = options.keepNUntagged !== undefined ? 1 : 0;
    const paramsTail: Array<number | string> = [
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

    const sql = `
      WITH root_candidates AS (
        SELECT
          root_version_id AS version_id,
          root_digest,
          root_manifest_kind,
          created_at,
          tag_count,
          is_tagged,
          has_ancestor
        FROM v_scan_root_manifests
        WHERE scan_id = ?
          ${cutoffSql}
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

    return this.#sql.all<Parameters<typeof mapPlanRootRow>[0]>(sql, [...params, ...paramsTail]).map(mapPlanRootRow);
  }
}
