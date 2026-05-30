import assert from "node:assert/strict";
import test from "node:test";
import type { GraphResponse, ManifestDetails } from "../src/_types.js";

test("visualizer graph types describe the expected graph payload shape", () => {
  const manifest = {
    id: "sha256:center",
    digest: "sha256:center",
    versionId: 1,
    createdAt: "2026-05-29T10:00:00.000Z",
    updatedAt: "2026-05-29T10:00:00.000Z",
    manifestKind: "multi_arch_manifest",
    mediaType: "application/vnd.oci.image.index.v1+json",
    displayPlatform: null,
    artifactType: null,
    subjectDigest: null,
    tags: [{ name: "single", changeStatus: "unchanged" }],
    changeStatus: "unchanged",
    rawJson: '{"kind":"center"}'
  } satisfies ManifestDetails;

  const graph = {
    owner: "acme",
    packageName: "demo",
    scanId: 1,
    centerDigest: manifest.digest,
    depth: 1,
    nodes: [manifest],
    edges: [
      {
        id: "sha256:center|sha256:child|image-child",
        from: "sha256:center",
        to: "sha256:child",
        kind: "image-child"
      }
    ]
  } satisfies GraphResponse;

  assert.equal(graph.nodes[0].digest, "sha256:center");
  assert.equal(graph.edges[0].kind, "image-child");
});
