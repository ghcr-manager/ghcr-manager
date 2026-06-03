import { buildDirectTargetRootTagFilters } from "./_planner-direct-target-root-tag-filters.js";
import { buildCombinedDirectTargetRootsQuery } from "./_planner-direct-target-roots-combined-sql.js";
import type { DirectTargetRootOptions } from "./_planner-direct-target-root-options.js";
import type { PlannerSql } from "./_planner-sql.js";
import { mapPlanRootRow, type DeletePlanRoot } from "./_planner-types.js";

export function listCombinedDirectTargetRoots(
  sql: PlannerSql,
  scanId: number,
  options: DirectTargetRootOptions
): DeletePlanRoot[] {
  const { selectedTagsSql, selectedParams, excludedVersionsSql, excludedParams } = buildDirectTargetRootTagFilters(
    sql,
    scanId,
    options
  );
  const { query, baseParams, tailParams } = buildCombinedDirectTargetRootsQuery(
    scanId,
    options,
    selectedTagsSql,
    excludedVersionsSql
  );

  return sql
    .all<
      Parameters<typeof mapPlanRootRow>[0]
    >(query, [...baseParams, scanId, scanId, ...selectedParams, ...excludedParams, ...tailParams])
    .map(mapPlanRootRow);
}
