import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds, type ManifestKind } from "../../../src/core/index.js";
import { openDatabase, ScanWriter } from "../../../src/db/index.js";
import type { DeletePlanRoot } from "../../../src/db/planner/index.js";
import { PlannerPlanArtifacts } from "../../../src/db/planner/_planner-plan-artifacts.js";

function _createHarness(packageName: string) {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  writer.startScan("acme", packageName, "2026-05-14T10:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  const scanRow = database.prepare("SELECT scan_id FROM package_scans").get() as { scan_id: number };

  const sql = {
    database,
    logger: {
      trace() {},
      debug() {}
    },
    exec(sqlText: string, params: Array<number | string | null> = []) {
      database.prepare(sqlText).run(...params);
    },
    all<T>(sqlText: string, params: Array<number | string>) {
      return database.prepare(sqlText).all(...params) as T[];
    },
    traceSql() {}
  } as unknown as ConstructorParameters<typeof PlannerPlanArtifacts>[0];

  return {
    database,
    writer,
    scanId: Number(scanRow.scan_id),
    artifacts: new PlannerPlanArtifacts(sql)
  };
}

function _insertManifestVersion(
  writer: ScanWriter,
  versionId: number,
  digest: string,
  createdAt: string,
  options: {
    manifestKind?: ManifestKind;
    mediaType?: string;
    tag?: string;
  } = {}
) {
  writer.insertPackageVersion({
    versionId,
    createdAt,
    updatedAt: createdAt
  });
  writer.insertManifest({
    versionId,
    digest,
    manifestKind: options.manifestKind ?? ManifestKinds.multiArchManifest,
    mediaType: options.mediaType ?? "application/vnd.oci.image.index.v1+json"
  });
  if (options.tag) {
    writer.insertTag({ tag: options.tag, versionId });
  }
}

test("planner plan artifacts prune descendants that retained tagged manifests still need", (t) => {
  const harness = _createHarness("pkg");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:root-a", "2026-05-03T10:00:00.000Z", { tag: "latest" });
  _insertManifestVersion(harness.writer, 2, "sha256:root-b", "2026-05-02T10:00:00.000Z");
  _insertManifestVersion(harness.writer, 3, "sha256:shared-child", "2026-05-01T10:00:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:root-a",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:root-b",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  harness.writer.rebuildManifestReachability();

  const artifacts = harness.artifacts.build(harness.scanId, [
    {
      versionId: 2,
      digest: "sha256:root-b",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);

  assert.deepEqual(
    artifacts.closureManifests.map((manifest) => manifest.memberDigest),
    ["sha256:root-b"]
  );
  assert.deepEqual(artifacts.blockedRoots, []);
  assert.deepEqual(artifacts.fullyDeletableRoots, [
    {
      versionId: 2,
      digest: "sha256:root-b",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ]);
});

test("planner plan artifacts ignore non-delete direct targets when building closure and blocks", (t) => {
  const harness = _createHarness("partial-tags");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:shared-root", "2026-05-03T10:00:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    tag: "stable"
  });

  const artifacts = harness.artifacts.build(harness.scanId, [
    {
      versionId: 1,
      digest: "sha256:shared-root",
      manifestKind: ManifestKinds.imageManifest,
      reason: "delete-tags-partial-tag-match",
      selectionMode: "untag-only"
    }
  ]);

  assert.deepEqual(artifacts, {
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    supportedUntagOnlyRootDigests: new Set()
  });
});

test("planner plan artifacts expand multi-arch child manifests and referrers into a fully deletable closure", (t) => {
  const harness = _createHarness("multiarch");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:multiarch-root", "2026-05-01T10:00:00.000Z");
  _insertManifestVersion(harness.writer, 2, "sha256:linux-amd64", "2026-05-01T10:01:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 3, "sha256:linux-arm64", "2026-05-01T10:02:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 4, "sha256:amd64-attestation", "2026-05-01T10:03:00.000Z", {
    manifestKind: ManifestKinds.artifactManifest,
    mediaType: "application/vnd.oci.artifact.manifest.v1+json"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:multiarch-root",
    childDigest: "sha256:linux-amd64",
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:multiarch-root",
    childDigest: "sha256:linux-arm64",
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:linux-amd64",
    childDigest: "sha256:amd64-attestation",
    edgeKind: "referrer"
  });
  harness.writer.rebuildManifestReachability();

  const directTargetRoots: DeletePlanRoot[] = [
    {
      versionId: 1,
      digest: "sha256:multiarch-root",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ];
  const artifacts = harness.artifacts.build(harness.scanId, directTargetRoots);

  assert.deepEqual(artifacts.blockedRoots, []);
  assert.deepEqual(artifacts.fullyDeletableRoots, directTargetRoots);
  assert.deepEqual(artifacts.supportedUntagOnlyRootDigests, new Set());
  assert.deepEqual(artifacts.closureManifests, [
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 1,
      memberDigest: "sha256:multiarch-root",
      memberManifestKind: ManifestKinds.multiArchManifest,
      hopsFromRoot: 0,
      memberRole: "root"
    },
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 2,
      memberDigest: "sha256:linux-amd64",
      memberManifestKind: ManifestKinds.imageManifest,
      hopsFromRoot: 1,
      memberRole: "descendant"
    },
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 3,
      memberDigest: "sha256:linux-arm64",
      memberManifestKind: ManifestKinds.imageManifest,
      hopsFromRoot: 1,
      memberRole: "descendant"
    },
    {
      sourceVersionId: 1,
      sourceDigest: "sha256:multiarch-root",
      memberVersionId: 4,
      memberDigest: "sha256:amd64-attestation",
      memberManifestKind: ManifestKinds.artifactManifest,
      hopsFromRoot: 2,
      memberRole: "descendant"
    }
  ]);
});

test("planner plan artifacts do not treat sibling wrapper indexes as overlapping when they reach different children", (t) => {
  const harness = _createHarness("siblings");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:tagged-wrapper", "2026-05-01T10:00:00.000Z", {
    tag: "single-amd64"
  });
  _insertManifestVersion(harness.writer, 2, "sha256:untagged-wrapper", "2026-05-01T10:01:00.000Z");
  _insertManifestVersion(harness.writer, 3, "sha256:amd64-child", "2026-05-01T10:02:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 4, "sha256:arm64-child", "2026-05-01T10:03:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:tagged-wrapper",
    childDigest: "sha256:amd64-child",
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:untagged-wrapper",
    childDigest: "sha256:arm64-child",
    edgeKind: "image-child"
  });
  harness.writer.rebuildManifestReachability();

  const directTargetRoots: DeletePlanRoot[] = [
    {
      versionId: 2,
      digest: "sha256:untagged-wrapper",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ];
  const artifacts = harness.artifacts.build(harness.scanId, directTargetRoots);

  assert.deepEqual(artifacts.blockedRoots, []);
  assert.deepEqual(artifacts.fullyDeletableRoots, directTargetRoots);
  assert.deepEqual(artifacts.supportedUntagOnlyRootDigests, new Set());
  assert.deepEqual(artifacts.closureManifests, [
    {
      sourceVersionId: 2,
      sourceDigest: "sha256:untagged-wrapper",
      memberVersionId: 2,
      memberDigest: "sha256:untagged-wrapper",
      memberManifestKind: ManifestKinds.multiArchManifest,
      hopsFromRoot: 0,
      memberRole: "root"
    },
    {
      sourceVersionId: 2,
      sourceDigest: "sha256:untagged-wrapper",
      memberVersionId: 4,
      memberDigest: "sha256:arm64-child",
      memberManifestKind: ManifestKinds.imageManifest,
      hopsFromRoot: 1,
      memberRole: "descendant"
    }
  ]);
});

test("planner plan artifacts block deleting a selected manifest that retained tagged manifests still need", (t) => {
  const harness = _createHarness("older-blocked");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:selected-image", "2026-01-01T10:00:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    tag: "pr-123"
  });
  _insertManifestVersion(harness.writer, 2, "sha256:young-retained-root", "2026-05-01T10:00:00.000Z", {
    tag: "latest"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:young-retained-root",
    childDigest: "sha256:selected-image",
    edgeKind: "image-child"
  });
  harness.writer.rebuildManifestReachability();

  const artifacts = harness.artifacts.build(harness.scanId, [
    {
      versionId: 1,
      digest: "sha256:selected-image",
      manifestKind: ManifestKinds.imageManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);

  assert.deepEqual(artifacts.blockedRoots, [
    {
      blockedVersionId: 1,
      blockedDigest: "sha256:selected-image",
      blockingVersionId: 2,
      blockingDigest: "sha256:young-retained-root",
      overlapDigest: "sha256:selected-image",
      overlapManifestKind: ManifestKinds.imageManifest,
      reason: "overlap-with-retained-root"
    }
  ]);
  assert.deepEqual(artifacts.fullyDeletableRoots, []);
  assert.deepEqual(artifacts.supportedUntagOnlyRootDigests, new Set());
});

test("planner plan artifacts include reverse-linked untagged manifests connected to a selected closure", (t) => {
  const harness = _createHarness("cosign");
  t.after(() => harness.database.close());

  const selectedDigest = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const signatureDigest = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const digestIndexDigest = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

  _insertManifestVersion(harness.writer, 1, selectedDigest, "2026-05-01T10:00:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    tag: "image-a"
  });
  _insertManifestVersion(harness.writer, 2, signatureDigest, "2026-05-01T10:01:00.000Z", {
    manifestKind: ManifestKinds.signatureManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 3, digestIndexDigest, "2026-05-01T10:02:00.000Z", {
    manifestKind: ManifestKinds.indexManifest,
    mediaType: "application/vnd.oci.image.index.v1+json",
    tag: "sha256-1111111111111111111111111111111111111111111111111111111111111111"
  });
  harness.writer.insertManifestEdge({
    parentDigest: selectedDigest,
    childDigest: signatureDigest,
    edgeKind: "referrer"
  });
  harness.writer.insertManifestEdge({
    parentDigest: digestIndexDigest,
    childDigest: selectedDigest,
    edgeKind: "digest-tag-referrer"
  });
  harness.writer.insertManifestEdge({
    parentDigest: digestIndexDigest,
    childDigest: signatureDigest,
    edgeKind: "image-child"
  });
  harness.writer.rebuildManifestReachability();

  const directTargetRoots: DeletePlanRoot[] = [
    {
      versionId: 1,
      digest: selectedDigest,
      manifestKind: ManifestKinds.imageManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ];
  const artifacts = harness.artifacts.build(harness.scanId, directTargetRoots);

  assert.deepEqual(artifacts.blockedRoots, []);
  assert.deepEqual(artifacts.fullyDeletableRoots, directTargetRoots);
  assert.deepEqual(artifacts.supportedUntagOnlyRootDigests, new Set());
  assert.deepEqual(
    artifacts.closureManifests.map((manifest) => [manifest.memberDigest, manifest.memberRole]),
    [
      [selectedDigest, "root"],
      [signatureDigest, "descendant"],
      [digestIndexDigest, "connected"]
    ]
  );
});

test("planner plan artifacts ignore unrelated tagged manifests in different graphs", (t) => {
  const harness = _createHarness("graph-prune");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:selected-root", "2026-05-01T10:00:00.000Z");
  _insertManifestVersion(harness.writer, 2, "sha256:selected-child", "2026-05-01T10:01:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:selected-root",
    childDigest: "sha256:selected-child",
    edgeKind: "image-child"
  });

  _insertManifestVersion(harness.writer, 3, "sha256:other-root", "2026-05-01T10:02:00.000Z", { tag: "keep-me" });
  _insertManifestVersion(harness.writer, 4, "sha256:other-child", "2026-05-01T10:03:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:other-root",
    childDigest: "sha256:other-child",
    edgeKind: "image-child"
  });

  harness.writer.rebuildManifestReachability();

  const directTargetRoots: DeletePlanRoot[] = [
    {
      versionId: 1,
      digest: "sha256:selected-root",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-untagged",
      selectionMode: "delete-root"
    }
  ];
  const artifacts = harness.artifacts.build(harness.scanId, directTargetRoots);

  assert.deepEqual(artifacts.blockedRoots, []);
  assert.deepEqual(artifacts.fullyDeletableRoots, directTargetRoots);
  assert.deepEqual(artifacts.supportedUntagOnlyRootDigests, new Set());
  assert.deepEqual(
    artifacts.closureManifests.map((manifest) => manifest.memberDigest),
    ["sha256:selected-root", "sha256:selected-child"]
  );
});

test("planner plan artifacts support untag-only for cosign indexes whose direct payload children are retained", (t) => {
  const harness = _createHarness("cosign-retained-index");
  t.after(() => harness.database.close());

  const retainedIndexDigest = "sha256:retained-index";
  const selectedIndexDigest = "sha256:selected-index";
  const imageDigest = "sha256:image";
  const attestationDigest = "sha256:attestation";
  const signatureDigest = "sha256:signature";
  const digestIndexDigest = "sha256:digest-index";

  _insertManifestVersion(harness.writer, 1, retainedIndexDigest, "2026-05-01T10:00:00.000Z", {
    tag: "multiarch"
  });
  _insertManifestVersion(harness.writer, 2, selectedIndexDigest, "2026-05-01T10:01:00.000Z", {
    manifestKind: ManifestKinds.indexManifest,
    tag: "image-a"
  });
  _insertManifestVersion(harness.writer, 3, imageDigest, "2026-05-01T10:02:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 4, attestationDigest, "2026-05-01T10:03:00.000Z", {
    manifestKind: ManifestKinds.attestationManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 5, signatureDigest, "2026-05-01T10:04:00.000Z", {
    manifestKind: ManifestKinds.signatureManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  _insertManifestVersion(harness.writer, 6, digestIndexDigest, "2026-05-01T10:05:00.000Z", {
    manifestKind: ManifestKinds.indexManifest,
    tag: "sha256-selected-index"
  });
  harness.writer.insertManifestEdge({
    parentDigest: retainedIndexDigest,
    childDigest: imageDigest,
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: retainedIndexDigest,
    childDigest: attestationDigest,
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: selectedIndexDigest,
    childDigest: imageDigest,
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: selectedIndexDigest,
    childDigest: attestationDigest,
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: selectedIndexDigest,
    childDigest: signatureDigest,
    edgeKind: "referrer"
  });
  harness.writer.insertManifestEdge({
    parentDigest: digestIndexDigest,
    childDigest: selectedIndexDigest,
    edgeKind: "digest-tag-referrer"
  });
  harness.writer.insertManifestEdge({
    parentDigest: digestIndexDigest,
    childDigest: signatureDigest,
    edgeKind: "image-child"
  });
  harness.writer.rebuildManifestReachability();

  const artifacts = harness.artifacts.build(harness.scanId, [
    {
      versionId: 2,
      digest: selectedIndexDigest,
      manifestKind: ManifestKinds.indexManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);

  assert.deepEqual(artifacts.supportedUntagOnlyRootDigests, new Set([selectedIndexDigest]));
});
