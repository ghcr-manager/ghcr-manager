import { buildTagSelectorPredicate } from "./_planner-tag-selectors.js";
import { PlannerSql } from "./_planner-sql.js";
import { mapPlanTagRows } from "./_planner-types.js";

export class PlannerDirectTargetTags {
  readonly #sql: PlannerSql;

  constructor(sql: PlannerSql) {
    this.#sql = sql;
  }

  listDeleteTagDirectTargetTags(
    scanId: number,
    deleteTags: string[],
    excludeTags: string[],
    useRegex: boolean,
    deleteOrphanedImages: boolean,
    cutoffTimestamp?: string
  ): string[] {
    if (deleteTags.length === 0) {
      return [];
    }

    const selectedTagPredicate = buildTagSelectorPredicate(this.#sql.database, "t.tag", deleteTags, useRegex);
    const params: Array<number | string> = [scanId, ...selectedTagPredicate.params];
    let excludedRootSql = "";
    let olderThanSql = "";
    if (excludeTags.length > 0) {
      const excludedTagPredicate = buildTagSelectorPredicate(this.#sql.database, "xt.tag", excludeTags, useRegex);
      excludedRootSql = `
        AND NOT EXISTS (
          SELECT 1
          FROM tags xt
          WHERE xt.scan_id = t.scan_id
            AND xt.version_id = t.version_id
            AND (${excludedTagPredicate.sql})
        )
      `;
      params.push(...excludedTagPredicate.params);
    }
    if (cutoffTimestamp) {
      olderThanSql = "AND pv.created_at < ?";
      params.push(cutoffTimestamp);
    }

    const digestTagFlag = deleteOrphanedImages ? 1 : 0;
    params.splice(1, 0, digestTagFlag);

    const sql = `
      SELECT DISTINCT tag AS target_tag
      FROM tags t
      JOIN package_versions pv
        ON pv.scan_id = t.scan_id
       AND pv.version_id = t.version_id
      JOIN manifests m
        ON m.scan_id = pv.scan_id
       AND m.version_id = pv.version_id
      WHERE t.scan_id = ?
        AND t.is_digest_tag = ?
        AND (${selectedTagPredicate.sql})
        ${excludedRootSql}
        ${olderThanSql}
      ORDER BY tag
    `;
    return mapPlanTagRows(this.#sql.all<Parameters<typeof mapPlanTagRows>[0][number]>(sql, params));
  }
}
