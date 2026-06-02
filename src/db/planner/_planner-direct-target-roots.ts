import { listCombinedDirectTargetRoots } from "./_planner-direct-target-roots-combined.js";
import { listTaggedOnlyDirectTargetRoots } from "./_planner-direct-target-roots-tagged.js";
import { PlannerSql } from "./_planner-sql.js";
import type { DeletePlanRoot } from "./_planner-types.js";
import type { DirectTargetRootOptions } from "./_planner-direct-target-root-options.js";

export class PlannerDirectTargetRoots {
  readonly #sql: PlannerSql;

  constructor(sql: PlannerSql) {
    this.#sql = sql;
  }

  list(scanId: number, options: DirectTargetRootOptions): DeletePlanRoot[] {
    if (
      options.deleteTagsRequested &&
      options.keepNTagged === undefined &&
      !options.deleteUntagged &&
      options.keepNUntagged === undefined
    ) {
      return listTaggedOnlyDirectTargetRoots(this.#sql, scanId, options);
    }
    return listCombinedDirectTargetRoots(this.#sql, scanId, options);
  }
}
