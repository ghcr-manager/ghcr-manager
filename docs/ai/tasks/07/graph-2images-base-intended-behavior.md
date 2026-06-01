# Intended Behavior: `2images base` Cleanup Cases

This note locks down the intended behavior for the simplest shared-manifest graph that is more complex than `1image`.

It is meant as the semantic baseline for the cleanup-rethink work before looking at attestations, cosign, or the
`2multiarch` overlap case.

## Start Graph

Scenario family: `graph-2images-base`

Seeded tags:

- `image-a`
- `image-b`
- `multiarch`
- `keep-dummy`

Conceptual shape:

- `image-a` points to image manifest `A`
- `image-b` points to image manifest `B`
- `multiarch` points to a multi-arch manifest `M`
- `M` references `A` and `B`
- `keep-dummy` points to one unrelated plain image `D`

So the package starts with:

- manifests: `4`
  - `A`
  - `B`
  - `M`
  - `D`
- tags: `4`
  - `image-a`
  - `image-b`
  - `multiarch`
  - `keep-dummy`

## Principles

The intended behavior for these base cases is:

1. A delete request names tags, not manifests.
2. Each requested tag is removed.
3. After those tag removals, a manifest stays if at least one remaining tag still needs it.
4. A manifest is deleted only if no remaining tag still needs it.
5. A shared manifest may therefore survive without one of its former tags.
6. A wrapper manifest like `multiarch` may be deleted while its child image manifests stay.
7. The unrelated `keep-dummy` branch always stays.

## Case 1: `graph-2images-base--delete-image-a`

Delete request:

- `image-a`

Expected remaining tags:

- `image-b`
- `multiarch`
- `keep-dummy`

Expected removed tags:

- `image-a`

Expected remaining manifests:

- image manifest `A` remains
- image manifest `B` remains
- dummy image manifest `D` remains
- multi-arch manifest `M` remains

Expected end counts:

- manifests: `4`
- tags: `3`

Interpretation:

- `image-a` is untagged, not fully deleted.
- `multiarch` stays tagged because it was not requested for deletion.
- The multi-arch manifest `M` still remains present because the surviving `multiarch` tag still points to it, and `M`
  still references `A` and `B`.

This is intentionally an untag/share-preserve result, not a full branch deletion.

## Case 2: `graph-2images-base--delete-multiarch`

Delete request:

- `multiarch`

Expected remaining tags:

- `image-a`
- `image-b`
- `keep-dummy`

Expected removed tags:

- `multiarch`

Expected remaining manifests:

- image manifest `A`
- image manifest `B`
- dummy image manifest `D`

Expected removed manifests:

- multi-arch manifest `M`

Expected end counts:

- manifests: `3`
- tags: `3`

Interpretation:

- Removing the shared multi-arch tag removes the multi-arch manifest itself.
- The child image manifests stay because they are still directly tagged by `image-a` and `image-b`.

This is the clearest “drop only the wrapper manifest” case.

## Case 3: `graph-2images-base--delete-image-a-and-multiarch`

Delete request:

- `image-a`
- `multiarch`

Expected remaining tags:

- `image-b`
- `keep-dummy`

Expected removed tags:

- `image-a`
- `multiarch`

Expected remaining manifests:

- image manifest `B`
- dummy image manifest `D`

Expected removed manifests:

- image manifest `A`
- multi-arch manifest `M`

Expected end counts:

- manifests: `2`
- tags: `2`

Interpretation:

- `A` can now disappear because nothing tagged still needs it.
- `M` also disappears because it was directly targeted and no surviving tag should keep it alive.
- `B` survives as the still-tagged independent image branch.

This is the simplest full branch-pruning case in the shared-manifest family.

## Why These Three Matter

These three cases define the baseline answers to:

- when a delete becomes untag-only
- when a shared wrapper manifest may be untagged but must remain present
- when a shared wrapper manifest may be deleted
- when a child image becomes deletable because all tagged paths to it are gone

If the cleanup logic cannot express these three cases cleanly, the later attestation/cosign variants will stay ambiguous
and hard to debug.

## Relation To Current Test Expectations

These expectations match the current scenario table that drove the new graph cleanup rows:

- `delete-image-a`: end manifests = start manifests, end tags = `3`
- `delete-multiarch`: like corresponding `1image` start scenario times `2`
- `delete-image-a and multiarch`: like corresponding `1image` start scenario but with `image-b` tag

The wording above is just the explicit graph interpretation of that compact table.
