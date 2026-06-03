import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import { openDatabase, ScanWriter } from "../../../src/db/index.js";
import { listTaggedOnlyDirectTargetRoots } from "../../../src/db/planner/_planner-direct-target-roots-tagged.js";

type _DirectTargetRootOptions = Parameters<typeof listTaggedOnlyDirectTargetRoots>[2];

function buildSql(database: ReturnType<typeof openDatabase>): Parameters<typeof listTaggedOnlyDirectTargetRoots>[0] {
  return {
    database,
    all<T>(query: string, params: unknown[] = []) {
      return database.prepare(query).all(...params) as T[];
    }
  } as unknown as Parameters<typeof listTaggedOnlyDirectTargetRoots>[0];
}

test("tagged-only direct target roots return empty when no delete tags are requested", () => {
  const database = openDatabase(":memory:");
  const sql = buildSql(database);
  const options: _DirectTargetRootOptions = {
    deleteTags: [],
    deleteTagsRequested: false,
    excludeTags: [],
    deleteUntagged: false,
    useRegex: false,
    deleteOrphanedImages: false
  };

  const roots = listTaggedOnlyDirectTargetRoots(sql, 1, options);

  assert.deepEqual(roots, []);
  database.close();
});

test("tagged-only direct target roots honor cutoff timestamps and excluded tags", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);

  writer.startScan("acme", "pkg", "2026-06-03T10:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: "sha256:keep-old",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ versionId: 1, tag: "delete-me" });
  writer.insertTag({ versionId: 1, tag: "keep-me" });
  writer.insertPackageVersion({
    versionId: 2,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 2,
    digest: "sha256:too-new",
    manifestKind: ManifestKinds.imageManifest,
    mediaType: "application/vnd.oci.image.manifest.v1+json"
  });
  writer.insertTag({ versionId: 2, tag: "delete-me" });
  writer.markScanCompleted("2026-06-03T10:00:00.000Z");

  const sql = buildSql(database);
  const options: _DirectTargetRootOptions = {
    deleteTags: ["delete-*"],
    deleteTagsRequested: true,
    excludeTags: ["keep-*"],
    deleteUntagged: false,
    useRegex: false,
    cutoffTimestamp: "2026-06-02T00:00:00.000Z",
    deleteOrphanedImages: false
  };
  const roots = listTaggedOnlyDirectTargetRoots(sql, writer.getActiveScanId(), options);

  assert.deepEqual(roots, []);
  database.close();
});

test("tagged-only direct target roots support orphaned digest-tag selection", () => {
  const database = openDatabase(":memory:");
  const writer = new ScanWriter(database);
  const selectedDigest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  writer.startScan("acme", "pkg", "2026-06-03T10:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 1,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z"
  });
  writer.insertManifest({
    versionId: 1,
    digest: selectedDigest,
    manifestKind: ManifestKinds.artifactManifest,
    mediaType: "application/vnd.oci.artifact.manifest.v1+json"
  });
  writer.insertTag({
    versionId: 1,
    tag: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.sig"
  });
  writer.markScanCompleted("2026-06-03T10:00:00.000Z");

  const sql = buildSql(database);
  const options: _DirectTargetRootOptions = {
    deleteTags: ["sha256-*.sig"],
    deleteTagsRequested: true,
    excludeTags: [],
    deleteUntagged: false,
    useRegex: false,
    deleteOrphanedImages: true
  };
  const roots = listTaggedOnlyDirectTargetRoots(sql, writer.getActiveScanId(), options);

  assert.deepEqual(roots, [
    {
      versionId: 1,
      digest: selectedDigest,
      manifestKind: ManifestKinds.artifactManifest,
      reason: "delete-tags-all-tags-selected",
      selectionMode: "delete-root"
    }
  ]);
  database.close();
});
