# Review Notes

## `src/cli/_tag-selector-resolver.ts`

Query in `_listLatestOrphanedTags()` looks weird.

At least this join `JOIN digest_tag_artifacts dta ON 1 = 1` looks questionable.

And the `parent` and `parent.digest IS NULL` looks more like a `NOT EXISTS` under the hood to me.

## `src/db/planner/_planner-plan-artifacts.ts`

Has grown to gigantic 466 lines. A lot of it is SQL which naturally is large. But can we please split this file - maybe
split methods with large SQL statements off or such.
