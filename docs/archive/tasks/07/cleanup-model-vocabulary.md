# Cleanup Model Vocabulary

This note defines the vocabulary for the cleanup rethink.

## Stop Using `root`

Do not use `root` as the primary cleanup concept.

Why:

- in a graph, `root` is ambiguous and easy to misread
- it sounds like a user-facing concept, but it is not
- it pulls discussion back toward the old planner model

## Core Terms

- tagged manifest: a manifest that currently has at least one user-visible tag
- selected tagged manifest: a tagged manifest matched by the user's filter
- retained tagged manifest: a tagged manifest not selected by the filter and still present after cleanup
- untagged manifest: a manifest with no remaining user-visible tag
- wrapper manifest: a manifest that references other manifests, such as `multiarch`
- child manifest: a manifest referenced by another manifest

## Cleanup Model

For now, ignore digest-based selection and define cleanup only in terms of tags and tagged manifests.

The model is:

1. The filter selects tagged manifests.
2. Cleanup removes the selected tags.
3. After those tag removals, determine which tags remain.
4. Any manifest still needed by a remaining tag stays.
5. Any manifest no longer needed by any remaining tag is deleted.

## Consequences

- A selected tagged manifest may remain present after cleanup if another remaining tag still needs its manifest.
- A wrapper manifest may be deleted while its child manifests stay.
- A selected tag disappearing does not automatically mean that the manifest behind it is deleted.
- Blocking language should describe retained usage, not say that some other `root` blocks deletion.

Use language like:

- `tag X still needs manifest Y`
- `manifest Y remains because tag X still reaches it`
- `manifest Y can be deleted because no remaining tag still needs it`
