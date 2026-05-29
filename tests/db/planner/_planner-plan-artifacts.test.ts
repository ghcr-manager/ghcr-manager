import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds, type ManifestKind } from "../../../src/core/index.js";
import { openDatabase, ScanWriter } from "../../../src/db/index.js";
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

test("planner plan artifacts derive closure members and retained-root blocks", (t) => {
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
    ["sha256:root-b", "sha256:shared-child"]
  );
  assert.deepEqual(artifacts.blockedRoots, [
    {
      blockedVersionId: 2,
      blockedDigest: "sha256:root-b",
      blockingVersionId: 1,
      blockingDigest: "sha256:root-a",
      overlapDigest: "sha256:shared-child",
      overlapManifestKind: ManifestKinds.imageManifest,
      reason: "overlap-with-retained-root"
    }
  ]);
  assert.deepEqual(artifacts.fullyDeletableRoots, []);
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
    fullyDeletableRoots: []
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

  const directTargetRoots = [
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

  const directTargetRoots = [
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

test("planner plan artifacts let younger retained roots block older delete candidates", (t) => {
  const harness = _createHarness("older-blocked");
  t.after(() => harness.database.close());

  _insertManifestVersion(harness.writer, 1, "sha256:old-delete-root", "2026-01-01T10:00:00.000Z", { tag: "pr-123" });
  _insertManifestVersion(harness.writer, 2, "sha256:young-retained-root", "2026-05-01T10:00:00.000Z", {
    tag: "latest"
  });
  _insertManifestVersion(harness.writer, 3, "sha256:shared-child", "2026-05-03T10:00:00.000Z", {
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:old-delete-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  harness.writer.insertManifestEdge({
    parentDigest: "sha256:young-retained-root",
    childDigest: "sha256:shared-child",
    edgeKind: "image-child"
  });
  harness.writer.rebuildManifestReachability();

  const artifacts = harness.artifacts.build(harness.scanId, [
    {
      versionId: 1,
      digest: "sha256:old-delete-root",
      manifestKind: ManifestKinds.multiArchManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);

  assert.deepEqual(artifacts.blockedRoots, [
    {
      blockedVersionId: 1,
      blockedDigest: "sha256:old-delete-root",
      blockingVersionId: 2,
      blockingDigest: "sha256:young-retained-root",
      overlapDigest: "sha256:shared-child",
      overlapManifestKind: ManifestKinds.imageManifest,
      reason: "overlap-with-retained-root"
    }
  ]);
});
