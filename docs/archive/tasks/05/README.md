# 05 Task: Output and doc refactor before first release

## Status

We are nearing publication of this tool, but the produced summary table is not ready for that.

## Test Setup

I ran this tool against a smaller GHCR. From that run the resulting files are in `./artifacts`:

- sqlite DB (if we need it): `artifacts/aicage__aicage-image-util.sqlite`
- JSON report of simple cleanup operation: `artifacts/aicage__aicage-image-util.sqlite--cleanup-summary.json`

I see the summary table in the GH run and also reproduced it locally with:

```shell
node tools/write-cleanup-step-summary.mjs \
  --step-summary-path artifacts/aicage__aicage-image-util.sqlite--cleanup-summary.md \
  --summary-json-path artifacts/aicage__aicage-image-util.sqlite--cleanup-summary.json
```

resulting in `artifacts/aicage__aicage-image-util.sqlite--cleanup-summary.md`.

## Analysis of current summary

- Unreadable to most users.
- Terms like these are not clear to users: `root`, `closure` and `manifest`.
- Lacks core info the users care about: delete counts for images, multi-arch, tags
- Optional delete counts for signatures, artifacts would be nice
- Layout inconsistent:
  - `Cleanup filter` should be tabular like the rest
  - `Matched tags` looks weird as only list but could be ok if it stays a list of string tags

### Term `root`

`root` to me means a pkg-version with 1 manifest selected by filter rules for tag (in rare cases digest) and timestamp.
Tag filter here for simplicity includes keep-tags, delete-untagged and such.

To a user this is a `tag` - with a small note on the docs that tag filters also work for digests.

### Term `closure`

Can we find something better, `children` if must be, `descendants` (really?), `affected` (?).

We argued about this one before, maybe it's just that English is not my mother language and I never use the term.

### Term `manifest`

This one we could use - target users are devs after all. Here for the summary we could as well use `item` - indicating
one of the things in the GHCR - those are afaik all listed when viewing the GHCR in a browser.

### Knowledge we can assume users have

Users will have basic Docker knowledge:

- images
- multi-arch manifests
- tags on either of them

artifacts and signature is already optional - but a dev can derive that these are attached to images and/or multi-arch
manifests.

And anyone having those in his GHCR will wonder anyway why there are so many manifests for so few actual images.

## Solution ideas

- Weed out the summary, clean up layout
- Avoid/replace terms unclear to users
- Add per `manifests.manifest_kind` counts of actual deleted manifests by deriving from to-delete manifests from
  `cleanup_root_decisions` by `manifest_reachability` to `manifest_reachability` or use one of the views (see
  `resources/sql/views`)

## First steps

1. You review this document until we have a shared understanding of the goal
2. You change the code, I review the git-diff in my IDE (outside chat, no need to print all diffs to me)
3. When I am happy I tell you to commit and we continue with the change until it's done
