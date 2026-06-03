import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../src/core/index.js";
import { rebuildManifestReachability } from "../../src/db/_manifest-reachability.js";
import { openDatabase, ScanWriter } from "../../src/db/index.js";

test("rebuildManifestReachability builds reachability bottom-up from direct manifest edges", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.startScan("acme", "example", "2026-04-20T12:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:index",
    manifestKind: ManifestKinds.indexManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:child-a",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:child-b",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 4,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 4,
    digest: "sha256:leaf",
    manifestKind: ManifestKinds.artifactManifest,
    mediaType: "application/vnd.oci.artifact.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:index",
    childDigest: "sha256:child-a",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:index",
    childDigest: "sha256:child-b",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:child-a",
    childDigest: "sha256:leaf",
    edgeKind: "referrer"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:child-b",
    childDigest: "sha256:leaf",
    edgeKind: "referrer"
  });

  rebuildManifestReachability(database, writer.getActiveScanId());

  const rows = database
    .prepare(
      `
        SELECT ancestor_digest, descendant_digest, min_distance
        FROM manifest_reachability
        ORDER BY ancestor_digest, descendant_digest
      `
    )
    .all() as Array<{
    ancestor_digest: string;
    descendant_digest: string;
    min_distance: number;
  }>;

  assert.deepEqual(rows, [
    {
      ancestor_digest: "sha256:child-a",
      descendant_digest: "sha256:child-a",
      min_distance: 0
    },
    {
      ancestor_digest: "sha256:child-a",
      descendant_digest: "sha256:leaf",
      min_distance: 1
    },
    {
      ancestor_digest: "sha256:child-b",
      descendant_digest: "sha256:child-b",
      min_distance: 0
    },
    {
      ancestor_digest: "sha256:child-b",
      descendant_digest: "sha256:leaf",
      min_distance: 1
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:child-a",
      min_distance: 1
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:child-b",
      min_distance: 1
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:index",
      min_distance: 0
    },
    {
      ancestor_digest: "sha256:index",
      descendant_digest: "sha256:leaf",
      min_distance: 2
    },
    {
      ancestor_digest: "sha256:leaf",
      descendant_digest: "sha256:leaf",
      min_distance: 0
    }
  ]);

  const graphRows = database
    .prepare(
      `
        SELECT digest, graph_id
        FROM manifest_graphs
        ORDER BY digest
      `
    )
    .all() as Array<{
    digest: string;
    graph_id: number;
  }>;

  assert.deepEqual(graphRows, [
    { digest: "sha256:child-a", graph_id: 1 },
    { digest: "sha256:child-b", graph_id: 1 },
    { digest: "sha256:index", graph_id: 1 },
    { digest: "sha256:leaf", graph_id: 1 }
  ]);

  database.close();
});

test("rebuildManifestReachability rejects cycles in manifest edges", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.startScan("acme", "example", "2026-04-20T12:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:a",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:b",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:a",
    childDigest: "sha256:b",
    edgeKind: "image-child"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:b",
    childDigest: "sha256:a",
    edgeKind: "image-child"
  });

  assert.throws(() => rebuildManifestReachability(database, writer.getActiveScanId()), /detected a cycle/);

  database.close();
});

test("rebuildManifestReachability stitches digest-tag helper edges into recursive closure", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const rootDigest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const helperDigest = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const childDigest = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

  writer.startScan("acme", "example", "2026-04-20T12:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: rootDigest,
    manifestKind: ManifestKinds.indexManifest,
    mediaType: "application/vnd.oci.image.index.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: helperDigest,
    manifestKind: ManifestKinds.artifactManifest,
    mediaType: "application/vnd.oci.artifact.manifest.v1+json"
  });
  writer.insertTag({
    tag: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.sig",
    versionId: 2
  });
  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: childDigest,
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: helperDigest,
    childDigest,
    edgeKind: "referrer"
  });

  rebuildManifestReachability(database, writer.getActiveScanId());

  const digestTagEdgeRows = database
    .prepare(
      `
        SELECT parent_digest, child_digest, edge_kind
        FROM manifest_edges
        WHERE edge_kind = 'digest-tag-referrer'
      `
    )
    .all() as Array<{ parent_digest: string; child_digest: string; edge_kind: string }>;
  const reachabilityRows = database
    .prepare(
      `
        SELECT ancestor_digest, descendant_digest, min_distance
        FROM manifest_reachability
        WHERE ancestor_digest = ?
        ORDER BY descendant_digest
      `
    )
    .all(rootDigest) as Array<{
    ancestor_digest: string;
    descendant_digest: string;
    min_distance: number;
  }>;
  const helperReachabilityRows = database
    .prepare(
      `
        SELECT ancestor_digest, descendant_digest, min_distance
        FROM manifest_reachability
        WHERE ancestor_digest = ?
        ORDER BY descendant_digest
      `
    )
    .all(helperDigest) as Array<{
    ancestor_digest: string;
    descendant_digest: string;
    min_distance: number;
  }>;

  assert.deepEqual(digestTagEdgeRows, [
    {
      parent_digest: helperDigest,
      child_digest: rootDigest,
      edge_kind: "digest-tag-referrer"
    }
  ]);
  assert.deepEqual(reachabilityRows, [
    {
      ancestor_digest: rootDigest,
      descendant_digest: rootDigest,
      min_distance: 0
    }
  ]);
  assert.deepEqual(helperReachabilityRows, [
    {
      ancestor_digest: helperDigest,
      descendant_digest: rootDigest,
      min_distance: 1
    },
    {
      ancestor_digest: helperDigest,
      descendant_digest: helperDigest,
      min_distance: 0
    },
    {
      ancestor_digest: helperDigest,
      descendant_digest: childDigest,
      min_distance: 1
    }
  ]);

  const graphRows = database
    .prepare(
      `
        SELECT digest, graph_id
        FROM manifest_graphs
        ORDER BY digest
      `
    )
    .all() as Array<{
    digest: string;
    graph_id: number;
  }>;

  assert.deepEqual(graphRows, [
    { digest: rootDigest, graph_id: 1 },
    { digest: helperDigest, graph_id: 1 },
    { digest: childDigest, graph_id: 1 }
  ]);

  database.close();
});

test("rebuildManifestReachability assigns different graph ids to disconnected manifest graphs", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.startScan("acme", "example", "2026-04-20T12:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });

  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:a",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:b",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:a",
    childDigest: "sha256:b",
    edgeKind: "image-child"
  });

  writer.insertPackageVersion({
    versionId: 3,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 3,
    digest: "sha256:c",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertPackageVersion({
    versionId: 4,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 4,
    digest: "sha256:d",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertManifestEdge({
    parentDigest: "sha256:c",
    childDigest: "sha256:d",
    edgeKind: "referrer"
  });

  writer.insertPackageVersion({
    versionId: 5,
    createdAt: "2026-04-20T10:00:00.000Z",
    updatedAt: "2026-04-20T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 5,
    digest: "sha256:e",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });

  rebuildManifestReachability(database, writer.getActiveScanId());

  const graphRows = database
    .prepare(
      `
        SELECT digest, graph_id
        FROM manifest_graphs
        ORDER BY digest
      `
    )
    .all() as Array<{
    digest: string;
    graph_id: number;
  }>;

  assert.deepEqual(graphRows, [
    { digest: "sha256:a", graph_id: 1 },
    { digest: "sha256:b", graph_id: 1 },
    { digest: "sha256:c", graph_id: 2 },
    { digest: "sha256:d", graph_id: 2 },
    { digest: "sha256:e", graph_id: 3 }
  ]);

  database.close();
});
