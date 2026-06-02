import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import type { DirectTargetRootOptions } from "./_planner-direct-target-root-options.js";
import type { PlannerSql } from "./_planner-sql.js";

export interface DirectTargetRootTagFilters {
  selectedTagsSql: string;
  selectedParams: Array<number | string>;
  excludedVersionsSql: string;
  excludedParams: Array<number | string>;
}

export function buildDirectTargetRootTagFilters(
  sql: PlannerSql,
  scanId: number,
  options: DirectTargetRootOptions
): DirectTargetRootTagFilters {
  const selectedTagPredicate =
    options.deleteTags.length > 0
      ? buildTagSelectorPredicate(sql.database, "t.tag", options.deleteTags, options.useRegex ?? false)
      : undefined;
  const excludedTagPredicate =
    options.excludeTags.length > 0
      ? buildTagSelectorPredicate(sql.database, "xt.tag", options.excludeTags, options.useRegex ?? false)
      : undefined;

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
  const selectedParams = selectedTagPredicate ? [scanId, selectedTagDigestFlag, ...selectedTagPredicate.params] : [];

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
  const excludedParams = excludedTagPredicate ? [scanId, ...excludedTagPredicate.params] : [];

  return {
    selectedTagsSql,
    selectedParams,
    excludedVersionsSql,
    excludedParams
  };
}
