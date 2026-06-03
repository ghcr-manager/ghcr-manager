import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import { PlannerSql } from "./_planner-sql.js";
import { mapPlanRootRow, type DeletePlanRoot } from "./_planner-types.js";
import type { DirectTargetRootOptions } from "./_planner-direct-target-root-options.js";

export function listTaggedOnlyDirectTargetRoots(
  sql: PlannerSql,
  scanId: number,
  options: DirectTargetRootOptions
): DeletePlanRoot[] {
  const selectedTagPredicate =
    options.deleteTags.length > 0
      ? buildTagSelectorPredicate(sql.database, "t.tag", options.deleteTags, options.useRegex ?? false)
      : undefined;
  const excludedTagPredicate =
    options.excludeTags.length > 0
      ? buildTagSelectorPredicate(sql.database, "xt.tag", options.excludeTags, options.useRegex ?? false)
      : undefined;

  const params: Array<number | string> = [];
  const cutoffSql = options.cutoffTimestamp ? "AND pv.created_at < ?" : "";
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

  const deleteOrphanedImages = options.deleteOrphanedImages ? 1 : 0;
  const query = `
    WITH selected_tags AS (
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
    tagged_versions AS (
      SELECT
        m.version_id,
        m.digest AS root_digest,
        m.manifest_kind AS root_manifest_kind,
        COUNT(t.tag) AS total_tag_count
      FROM manifests m
      JOIN package_versions pv
        ON pv.scan_id = m.scan_id
       AND pv.version_id = m.version_id
      LEFT JOIN tags t
        ON t.scan_id = m.scan_id
       AND t.version_id = m.version_id
       AND t.is_digest_tag = 0
      WHERE m.scan_id = ?
        ${cutoffSql}
      GROUP BY
        m.version_id,
        m.digest,
        m.manifest_kind
    ),
    eligible_tagged_roots AS (
      SELECT
        tv.version_id,
        tv.root_digest,
        tv.root_manifest_kind,
        CASE
          WHEN ? = 1 AND tv.total_tag_count = 0 AND COALESCE(mtc.matched_tag_count, 0) > 0
            THEN COALESCE(mtc.matched_tag_count, 0)
          ELSE tv.total_tag_count
        END AS total_tag_count,
        COALESCE(mtc.matched_tag_count, 0) AS matched_tag_count
      FROM tagged_versions tv
      LEFT JOIN matched_tag_counts mtc
        ON mtc.version_id = tv.version_id
      LEFT JOIN excluded_versions ev
        ON ev.version_id = tv.version_id
      WHERE (
          tv.total_tag_count > 0
          OR (? = 1 AND COALESCE(mtc.matched_tag_count, 0) > 0)
        )
        AND ev.version_id IS NULL
        AND matched_tag_count > 0
    )
    SELECT
      version_id,
      root_digest,
      root_manifest_kind,
      CASE
        WHEN total_tag_count = matched_tag_count
          THEN 'delete-tags-all-tags-selected'
        ELSE 'delete-tags-partial-tag-match'
      END AS direct_target_reason,
      CASE
        WHEN total_tag_count = matched_tag_count
          THEN 'delete-root'
        ELSE 'untag-only'
      END AS selection_mode
    FROM eligible_tagged_roots
    ORDER BY root_digest
  `;

  return sql
    .all<Parameters<typeof mapPlanRootRow>[0]>(query, [...params, scanId, deleteOrphanedImages, deleteOrphanedImages])
    .map(mapPlanRootRow);
}
