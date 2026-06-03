# 07 Task: Rethink Cleanup Logic

## Status

We have to rethink the logic of the cleanup command.

This action started with an existing action by another author as template, see `../../dataaxiom/ghcr-cleanup-action/`.

We achieved feature parity and have scenarios to compare the result of cleanups by this action and by
`ghcr-cleanup-action`.

Tha comparison showed that we got very close. Only in few cases did we differ.

So we tried to fix the remaining edge cases. Without success - at one point we even inverted the direction of sha-tag
relations in our DB. This got us closer but then the logic had flaws in other cases.

I think it's ins areas were afaik the other action also does not process totally correctly.

So I stopped hitting my head against the wall for a week or two now, hoping for inspiration.

The flaws arise in complex graphs, not the simpler ones. I think it's when either cosign and/or provenance are used in
the scenario. And even then it might even be correct when we only have images and the cosign/attestation manifests. But
when we add multi-arch and also give them cosign and provenance, then somewhere when deleting some manifest some related
stuff remains undeleted even though it should be gone.

A full visualization of 2 images, multi-arch manifest and signature/attestaion for images and multi-arch can be seen at
`artifacts/visualizer_single-scenario_20260531_110445.png`

Sorry - it's 2 weeks ago and I don't remember all the details. But when comparing a DB with all scenarios from both
actions in it with some queries (probably
`artifacts/_BACKUP/query_scenario_count_kinds_with_executor_delta_differences.sql`) we saw pretty clearly where the
actions differ in result on equal scenarios.

- I created a branch `test-0.9.7` (pre recent changes) and ran the matrix-test with both actions.
- The resulting DB with all results is in `artifacts/0.9.7/0.9.7-ghcr-manager-merged--scenario-matrix-cleanup.sqlite`
- I think the final query was `artifacts/0.9.7/0.9.7-ghcr-manager-merged--scenario-matrix-cleanup.sqlite`
- Running that query looks like what I remember. Maybe we were a bit closer to the action once and I tried things and
  this state contains the attempts. But it's very close to where I realized that hacking our logic in part would not be
  sufficient - we have to rethink the logic.

I think the cases where both actions struggled was something like:

```text
one of the extra index manifests added with cosign or attestations (or the one with the image-tag on it, also appears
with cosign or so as in simple cases the image tag is on the image) was treated as "root" by the logic and wrongly
blocked deletion of manifests.

But those extra index manifests to a human belong to the image and should not block but rather be deleted along with it.

I might be mistaken and ths blockage happened on multi-arch, but I remember it had to do with extra index manifests
which appear with cosign or attestation.
```

### Recent changes

#### Visualizer

The flaw in our logic show only in more complex graphs and I have trouble visualizing them mentally. To aid myself (and
maybe it's useful to others) we added the `visualizer` yesterday which shows graphs and can even show what changed
between 2 scans of that graph (before and after a cleanup - helps to quickly see the delta).

#### Inversion of sha-tag references now gone

As mentioned earlier the code inverted sha-tag relation directions. I don't remember when we did that (I don't think
from the start but might have squashed changes) but think our comparisons of the 2 actions results was with inverted
direction, at least the final ones before I gave up.

When developing the visualizer it became apparent that storing such relations inverted leads to an incorrect
visualization. So we undid the inversion, knowing that some current cleanup tests (unit and scenarios) would fail.

There now is at least one `// TODO` in the code for this and during live tests (part of release) at least one scenario
test fails.

This also means that atm comparing both actions makes little sense - we have to fix our core logic first.

## Path To Solution

I have no clear new logic yet. I can pretty much from a graph define in human terms what should be deleted with what.  
But how to put that as decision rules in code-worthy logic is not yet clear to me.

### Graphs To Look at

One approach to narrow this down is to have scenarios to discuss what would happen with potential approaches.

And with the visualizer and me being able to tell from visualized graphs this might be helpful as the possible graphs
are limited to:

A. Base cases

1. One image
2. 2 images with a connecting multi-arch
3. One image in several multi-arch:  
   2 images with a connecting multi-arch, a 3rd image and a multiarch for the 3rd and one of the first 2 images.

B. Extended cases

1. A.x
2. A.x plus attestations (on all images and multi-arch)
3. A.x plus cosign (on all images and multi-arch)
4. A.x plus both cosign and attestations (on all images and multi-arch)

This gives us a 3x4 matrix of 12 graphs. I would even keep A.3 a bit separate as those graphs soon become hard to
discuss due to sheer number of manifests. We should have them - but discuss logic approaches on the simpler ones first
and only then validate logic approaches against A.3 cases.

#### Task: Scenarios for A-B matrix

Can you please add scenarios for the A-B matrix?

Like (or even alongside) those used in `.github/workflows/test_scenario-executor-matrix.yml`. Maybe even copy that
matrix workflow file as it's quite compact, and then I can run the A-B matrix scenarios alone.

The current matrix logic probably expects a cleanup operation and verification code - if so make both cleanup and
verification bogus/no-op. This makes sense as it fits into what we have and likely there will be tests on those
scenarios once we have new approaches to our cleanup logic.

I will likely screenshot each briefly - maybe we can then even wrap those images in a nice Markdown for documentation.

### Task: Discussion about current and new logic

The current logic is heavily influenced by the other action. Which was good - it has some maturity and works in many
cases. But by now I think that actions approach hits a limit when the graphs get complexer as they do with cosign and
attestations.

So I want to discuss this from scratch.

1. How do humans and docker see and use GHCR packages.
2. What are the expectations and goals of humans when deleting stuff in regard to what gets deleted alongside and what
   can block. Our visualizations will come handy here.
3. How does that translate to logic we can write in code or SQL.
4. In theory a GHCR package can have wild stuff like tags on an attestation or image-indexes with weird relations. We
   should exclude those from the initial logic finding thought process for simplicity. Once we start settling on a
   logical approach we can then optionally think about how the logic would hold up against such cases.

> Note: We do not need to keep full feature parity with the other action. I think some of its features might even exist
> to counter-cleanup some stuff it can leave behind (orphans and such). We need user-friendly cleanup - not really
> feature-parity (although was/is handy for comparisons).

### Task: Implement new logic

This shall be a clean refactoring.

- Implement new approach
  - no backwards compatibility at all (this is all still beta code)
  - make sure to decide early which code to drop and which to refactor
  - I want no leftover code, and no weird constructs which only are this way because of rewrite and written from scratch
    it would look completely different
  - Test new approach in scenarios like we do now. Compare with the other actions results where applicable.

## Tasks

- Task: Scenarios for A-B matrix
- Task: Discussion about current and new logic
- Task: Implement new logic
