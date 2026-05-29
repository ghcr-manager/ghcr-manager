import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ManifestKinds } from "../../src/core/index.js";
import { openDatabase, ScanWriter } from "../../src/db/index.js";
import { resolveTagSelectors } from "../../src/cli/_tag-selector-resolver.js";
import { importFileScan } from "../helpers/index.js";

type _PlanCommandInputs = Parameters<typeof resolveTagSelectors>[1];

async function _withTempDatabase(
  run: (context: {
    database: ReturnType<typeof openDatabase>;
    databasePath: string;
    writer: ScanWriter;
  }) => Promise<void> | void
): Promise<void> {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);

  try {
    await run({ database, databasePath, writer });
  } finally {
    database.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function _withSampleDatabase(
  run: (context: { database: ReturnType<typeof openDatabase>; databasePath: string }) => Promise<void>
): Promise<void> {
  await _withTempDatabase(async ({ database, databasePath, writer }) => {
    await importFileScan("tests/fixtures/sample-package.json", writer);
    await run({ database, databasePath });
  });
}

function _buildInputs(overrides: Partial<_PlanCommandInputs>): _PlanCommandInputs {
  return {
    databasePath: "scan.sqlite",
    owner: "acme",
    packageName: "example",
    deleteTags: [],
    deleteTagsRequested: false,
    deleteGhostImages: false,
    deletePartialImages: false,
    deleteOrphanedImages: false,
    excludeTags: [],
    deleteUntagged: false,
    useRegex: false,
    ...overrides
  };
}

function _insertVersionWithManifest(
  writer: ScanWriter,
  versionId: number,
  digest: string,
  createdAt: string,
  options: {
    mediaType: string;
    manifestKind:
      | typeof ManifestKinds.indexManifest
      | typeof ManifestKinds.imageManifest
      | typeof ManifestKinds.signatureManifest;
    tag?: string;
  }
) {
  writer.insertPackageVersion({
    versionId,
    createdAt,
    updatedAt: createdAt
  });
  writer.insertManifest({
    versionId,
    digest,
    mediaType: options.mediaType,
    manifestKind: options.manifestKind
  });
  if (options.tag) {
    writer.insertTag({
      tag: options.tag,
      versionId
    });
  }
}

test("resolveTagSelectors keeps wildcard delete-tag selectors for planner-side SQL matching", async () => {
  await _withSampleDatabase(async ({ database, databasePath }) => {
    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTags: ["*me"],
        deleteTagsRequested: true
      })
    );

    assert.deepEqual(resolved.deleteTags, ["*me"]);
    assert.deepEqual(resolved.excludeTags, []);
  });
});

test("resolveTagSelectors treats sql wildcard characters literally in wildcard mode", () => {
  _withTempDatabase(({ database, databasePath, writer }) => {
    writer.startScan("acme", "example", "2026-05-15T00:00:00.000Z", {
      rawJson: JSON.stringify({ visibility: "private" })
    });
    _insertVersionWithManifest(writer, 201, "sha256:literal-percent", "2026-05-10T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.imageManifest,
      tag: "release%candidate_1"
    });
    _insertVersionWithManifest(writer, 202, "sha256:similar", "2026-05-11T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.imageManifest,
      tag: "releasexcandidatez1"
    });
    writer.markScanCompleted("2026-05-15T00:00:00.000Z");

    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTags: ["release%candidate_1"],
        deleteTagsRequested: true
      })
    );

    assert.deepEqual(resolved.deleteTags, ["release%candidate_1"]);
  });
});

test("resolveTagSelectors keeps wildcard delete-tag and exclude-tag selectors for planner-side SQL matching", async () => {
  await _withSampleDatabase(async ({ database, databasePath }) => {
    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTags: ["l*"],
        deleteTagsRequested: true,
        excludeTags: ["*me"]
      })
    );

    assert.deepEqual(resolved.deleteTags, ["l*"]);
    assert.deepEqual(resolved.excludeTags, ["*me"]);
  });
});

test("resolveTagSelectors keeps regex delete-tag and exclude-tag selectors for planner-side SQL matching", async () => {
  await _withSampleDatabase(async ({ database, databasePath }) => {
    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTags: ["^l.*"],
        deleteTagsRequested: true,
        excludeTags: [".*me$"],
        useRegex: true
      })
    );

    assert.deepEqual(resolved.deleteTags, ["^l.*"]);
    assert.deepEqual(resolved.excludeTags, [".*me$"]);
  });
});

test("resolveTagSelectors resolves orphaned sha256 tags with missing parent digests", () => {
  _withTempDatabase(({ database, databasePath, writer }) => {
    const orphanParentDigest = `sha256:${"a".repeat(64)}`;
    const existingParentDigest = `sha256:${"b".repeat(64)}`;

    writer.startScan("acme", "example", "2026-05-15T00:00:00.000Z", {
      rawJson: JSON.stringify({ visibility: "private" })
    });
    _insertVersionWithManifest(writer, 201, "sha256:orphaned-signature", "2026-05-10T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.signatureManifest,
      tag: `${orphanParentDigest.replace("sha256:", "sha256-")}.sig`
    });
    _insertVersionWithManifest(writer, 202, "sha256:linked-signature", "2026-05-11T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.signatureManifest,
      tag: `${existingParentDigest.replace("sha256:", "sha256-")}.sig`
    });
    _insertVersionWithManifest(writer, 203, existingParentDigest, "2026-05-09T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.imageManifest
    });
    writer.markScanCompleted("2026-05-15T00:00:00.000Z");

    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTagsRequested: true,
        deleteOrphanedImages: true
      })
    );

    assert.deepEqual(resolved.deleteTags, [`${orphanParentDigest.replace("sha256:", "sha256-")}.sig`]);
    assert.deepEqual(resolved.excludeTags, []);
  });
});

test("resolveTagSelectors resolves ghost image tags when all image index children are missing", () => {
  _withTempDatabase(({ database, databasePath, writer }) => {
    writer.startScan("acme", "example", "2026-05-15T00:00:00.000Z", {
      rawJson: JSON.stringify({ visibility: "private" })
    });
    _insertVersionWithManifest(writer, 201, "sha256:ghost-index", "2026-05-10T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifestKind: ManifestKinds.indexManifest,
      tag: "ghost"
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:ghost-index",
      childDigest: "sha256:missing-amd64",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "amd64" }
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:ghost-index",
      childDigest: "sha256:missing-arm64",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "arm64" }
    });
    _insertVersionWithManifest(writer, 202, "sha256:partial-index", "2026-05-11T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifestKind: ManifestKinds.indexManifest,
      tag: "partial"
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:partial-index",
      childDigest: "sha256:present-child",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "amd64" }
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:partial-index",
      childDigest: "sha256:missing-child",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "arm64" }
    });
    _insertVersionWithManifest(writer, 203, "sha256:present-child", "2026-05-11T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.imageManifest
    });
    writer.rebuildManifestReachability();
    writer.markScanCompleted("2026-05-15T00:00:00.000Z");

    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTagsRequested: true,
        deleteGhostImages: true
      })
    );

    assert.deepEqual(resolved.deleteTags, ["ghost"]);
    assert.deepEqual(resolved.excludeTags, []);
  });
});

test("resolveTagSelectors resolves partial image tags when some image index children are missing", () => {
  _withTempDatabase(({ database, databasePath, writer }) => {
    writer.startScan("acme", "example", "2026-05-15T00:00:00.000Z", {
      rawJson: JSON.stringify({ visibility: "private" })
    });
    _insertVersionWithManifest(writer, 201, "sha256:partial-index", "2026-05-10T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifestKind: ManifestKinds.indexManifest,
      tag: "partial"
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:partial-index",
      childDigest: "sha256:present-child",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "amd64" }
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:partial-index",
      childDigest: "sha256:missing-child",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "arm64" }
    });
    _insertVersionWithManifest(writer, 202, "sha256:present-child", "2026-05-11T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      manifestKind: ManifestKinds.imageManifest
    });
    _insertVersionWithManifest(writer, 203, "sha256:ghost-index", "2026-05-12T00:00:00.000Z", {
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifestKind: ManifestKinds.indexManifest,
      tag: "ghost"
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:ghost-index",
      childDigest: "sha256:missing-amd64",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "amd64" }
    });
    writer.insertManifestDescriptor({
      parentDigest: "sha256:ghost-index",
      childDigest: "sha256:missing-arm64",
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      platform: { os: "linux", architecture: "arm64" }
    });
    writer.rebuildManifestReachability();
    writer.markScanCompleted("2026-05-15T00:00:00.000Z");

    const resolved = resolveTagSelectors(
      database,
      _buildInputs({
        databasePath,
        deleteTagsRequested: true,
        deletePartialImages: true
      })
    );

    assert.deepEqual(resolved.deleteTags, ["partial"]);
    assert.deepEqual(resolved.excludeTags, []);
  });
});
