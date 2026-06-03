# 06 Task: Visualize manifest graphs

## Status

The current logic has a flaw (image-index manifest only linking image and attestation manifest block image removal) and
I have to rethink the core logic of handling manifest graphs.

And honestly: Picturing such graphs from raw manifests and what they point at in my head is hard.

## Idea

So I want to bring up an old idea of mine: Visualize manifest graphs.

Seeing how manifest graphs actually look would help me understand how cosign and attestations affect graphs.

I laid down the rough idea in the [ideas bucket](../../../ai/IDEAS_BUCKET.md) a while ago. That must not be taken word
per word as it's just an early note about my idea of showing graphs in a browser UI.

## Details to discuss

This can grow ...

### Detail 01: Split of code repos

Currently, the GH action handling and the node CLI code are in one repo, and I am still very hesitant to split that into
2 repos. GH action is the core and main use of that CLI code and for a GH action the code has to be built on the fly
(blame better-sqlite for that).

#### Split repo arguments

But the new visualizer in a browser will very likely have some sort of REST API backend, potentially a backend webserver
and so. And that goes beyond the current CLI tool code.

And the current repo with all the test-scenario workflows is already complex enough for what it does. Small point for
having the visualizer separate.

Plus why would we want to compile visualizer code when ghcr-manager runs in a GH action? Sure we could split off that
compilation - but extra complexity.

Not to speak of maybe needing some browser only JS code, maybe some HTML files on top.

#### Same repo arguments

On thew other hand, keeping such visualizer code - which uses the same DB - in one repo makes it easier to share logic,
at least the DB related types. We could think about a shared library - but likely that means a 3rd repo. And thus more
overhead.

### Detail 02: Base architecture

I have not done this before and am not very familiar with node. But from Java I imagine this needs a small backend which
talks to the DB and by REST-API hands data to a frontend.

What do you suggest? And what technologie for backend/frontend/whatever?

### Detail 03: What I want to see

This must not come all at once from the start.

Here are the things I'd like to see in a graph visualization:

- pkg-version and manifest digest
- our "untrusted" manifest-kind
- tags on pkg-versions (except the sha-tags)
- lines to other manifests with info:
  - directional (who sees who)
  - type of reference (sha-tag, subject ... the other kind from manifest JSON)
- theoretically a graph can be (almost) endless so there must be a "layer" limit.  
  I picture the graph always being centered on one manifest with max n layers around it.  
  Thus one could select the next manifest to be centered and thus travers in large graphs.  
  But I have not used such graph UIs myself, that's just my vague imagination.  
  Seeing at least the basic info (pkg-version, digest and manifest-kind) of the layer directly around the center
  manifest would be helpful though.
- Are triangles possible to visualize in such a graph? I am not sure, but think an attestation or cosign signature
  creates a triangle, or not?
