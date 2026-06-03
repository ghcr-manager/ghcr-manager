import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { GraphRepository } from "../src/_graph-repository.js";

function _createRepository() {
  const directory = mkdtempSync(join(tmpdir(), "ghcr-visualizer-"));
  const databasePath = join(directory, "scan.sqlite");
  const database = new Database(databasePath);
  _initializeSchema(database);
  const olderScanId = _insertScan(database, "scan-uuid-older", "2026-05-29T10:00:00.000Z");
  const newerScanId = _insertScan(database, "scan-uuid-newer", "2026-05-30T10:00:00.000Z");

  _seedOlderScan(database, olderScanId);
  _seedNewerScan(database, newerScanId);

  const repository = new GraphRepository(database);
  const cleanup = () => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  };

  return { repository, cleanup, olderScanId, newerScanId };
}

test("graph repository resolves the latest scan and manifest by tag", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const manifest = repository.resolveManifest("acme", "demo", undefined, undefined, { tag: "single" });
    assert.equal(manifest.scanId > 0, true);
    assert.equal(manifest.digest, "sha256:center");
    assert.deepEqual(manifest.tags, ["single"]);
  } finally {
    cleanup();
  }
});

test("graph repository resolves compare-only tags and prefers the primary scan when a tag moved", () => {
  const { repository, cleanup, olderScanId, newerScanId } = _createRepository();
  try {
    const compareOnlyManifest = repository.resolveManifest("acme", "demo", olderScanId, newerScanId, {
      tag: "single-arm64"
    });
    assert.equal(compareOnlyManifest.digest, "sha256:arm64");

    const movedTagManifest = repository.resolveManifest("acme", "demo", newerScanId, olderScanId, {
      tag: "moved-tag"
    });
    assert.equal(movedTagManifest.digest, "sha256:arm64");
  } finally {
    cleanup();
  }
});

test("graph repository lists owners, packages, and scans for selector dropdowns", () => {
  const { repository, cleanup, olderScanId, newerScanId } = _createRepository();
  try {
    assert.deepEqual(repository.listOwners(), [{ owner: "acme" }]);
    assert.deepEqual(repository.listPackages("acme"), [{ packageName: "demo" }]);
    assert.deepEqual(repository.listScans("acme", "demo"), [
      { scanId: newerScanId, scanCompletedAt: "2026-05-30T10:00:00.000Z" },
      { scanId: olderScanId, scanCompletedAt: "2026-05-29T10:00:00.000Z" }
    ]);
  } finally {
    cleanup();
  }
});

test("graph repository lists capped compare-aware tag suggestions by substring", () => {
  const { repository, cleanup, olderScanId, newerScanId } = _createRepository();
  try {
    assert.deepEqual(repository.listTags("acme", "demo", olderScanId, undefined, "single", 20), [
      { tagName: "single" },
      { tagName: "single-amd64" }
    ]);
    assert.deepEqual(repository.listTags("acme", "demo", newerScanId, undefined, "single", 20), [
      { tagName: "single" },
      { tagName: "single-arm64" }
    ]);
    assert.deepEqual(repository.listTags("acme", "demo", newerScanId, olderScanId, "single", 20), [
      { tagName: "single" },
      { tagName: "single-amd64" },
      { tagName: "single-arm64" }
    ]);
    assert.deepEqual(repository.listTags("acme", "demo", newerScanId, olderScanId, "arm64", 20), [
      { tagName: "single-arm64" }
    ]);
    assert.deepEqual(repository.listTags("acme", "demo", newerScanId, olderScanId, "moved", 20), [
      { tagName: "moved-tag" }
    ]);
    assert.deepEqual(repository.listTags("acme", "demo", newerScanId, olderScanId, "", 20), []);
    assert.deepEqual(repository.listTags("acme", "demo", newerScanId, olderScanId, "sha256", 20), []);
  } finally {
    cleanup();
  }
});

test("graph repository returns visible intra-neighborhood edges and omits digest tags from labels", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const graph = repository.getGraph("acme", "demo", undefined, undefined, "sha256:center", 1);
    assert.equal(graph.centerDigest, "sha256:center");
    assert.deepEqual(
      graph.nodes
        .map((node) => ({
          digest: node.digest,
          tags: node.tags.map((tag) => ({ name: tag.name, changeStatus: tag.changeStatus })),
          changeStatus: node.changeStatus,
          displayPlatform: node.displayPlatform,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt
        }))
        .sort((left, right) => left.digest.localeCompare(right.digest)),
      [
        {
          digest: "sha256:arm64",
          tags: [
            { name: "moved-tag", changeStatus: "unchanged" },
            { name: "single-arm64", changeStatus: "unchanged" }
          ],
          changeStatus: "unchanged",
          displayPlatform: "linux/arm64",
          createdAt: "2026-05-30T10:00:00.000Z",
          updatedAt: "2026-05-30T10:00:00.000Z"
        },
        {
          digest: "sha256:center",
          tags: [{ name: "single", changeStatus: "unchanged" }],
          changeStatus: "unchanged",
          displayPlatform: null,
          createdAt: "2026-05-30T10:00:00.000Z",
          updatedAt: "2026-05-30T10:00:00.000Z"
        }
      ]
    );
    assert.deepEqual(graph.edges.map((edge) => edge.kind).sort(), ["image-child"]);
    assert.equal(
      graph.edges.some(
        (edge) => edge.from === "sha256:center" && edge.to === "sha256:arm64" && edge.kind === "image-child"
      ),
      true
    );
  } finally {
    cleanup();
  }
});

test("graph repository returns manifest details including payload", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const manifest = repository.getManifest("acme", "demo", undefined, undefined, "sha256:center");
    assert.equal(manifest.manifestKind, "multi_arch_manifest");
    assert.equal(manifest.rawJson, JSON.stringify({ kind: "center", scan: "newer" }));
    assert.equal(manifest.displayPlatform, null);
    assert.equal(manifest.createdAt, "2026-05-30T10:00:00.000Z");
    assert.equal(manifest.updatedAt, "2026-05-30T10:00:00.000Z");
    assert.deepEqual(
      manifest.tags.map((tag) => ({ name: tag.name, changeStatus: tag.changeStatus })),
      [{ name: "single", changeStatus: "unchanged" }]
    );
  } finally {
    cleanup();
  }
});

test("graph repository derives a display platform for image-manifest media types from descriptors", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const manifest = repository.getManifest("acme", "demo", undefined, undefined, "sha256:arm64");
    assert.equal(manifest.mediaType, "application/vnd.oci.image.manifest.v1+json");
    assert.equal(manifest.displayPlatform, "linux/arm64");
  } finally {
    cleanup();
  }
});

test("graph repository annotates node and tag changes across two unsorted scan ids", () => {
  const { repository, cleanup, olderScanId, newerScanId } = _createRepository();
  try {
    const graph = repository.getGraph("acme", "demo", olderScanId, newerScanId, "sha256:center", 1);
    assert.deepEqual(
      graph.nodes.map((node) => ({
        digest: node.digest,
        changeStatus: node.changeStatus,
        tags: node.tags.map((tag) => ({ name: tag.name, changeStatus: tag.changeStatus }))
      })),
      [
        {
          digest: "sha256:arm64",
          changeStatus: "added",
          tags: [
            { name: "moved-tag", changeStatus: "added" },
            { name: "single-arm64", changeStatus: "added" }
          ]
        },
        {
          digest: "sha256:center",
          changeStatus: "unchanged",
          tags: [{ name: "single", changeStatus: "unchanged" }]
        },
        {
          digest: "sha256:child",
          changeStatus: "removed",
          tags: [
            { name: "moved-tag", changeStatus: "removed" },
            { name: "single-amd64", changeStatus: "removed" }
          ]
        },
        {
          digest: "sha256:signature",
          changeStatus: "removed",
          tags: []
        }
      ]
    );
    assert.equal(graph.scanId, olderScanId);
    assert.equal(graph.compareScanId, newerScanId);
    assert.deepEqual(graph.edges.map((edge) => edge.kind).sort(), [
      "image-child",
      "image-child",
      "referrer",
      "referrer"
    ]);
  } finally {
    cleanup();
  }
});

test("graph repository returns removed manifests from compare mode details", () => {
  const { repository, cleanup, olderScanId, newerScanId } = _createRepository();
  try {
    const manifest = repository.getManifest("acme", "demo", newerScanId, olderScanId, "sha256:signature");
    assert.equal(manifest.changeStatus, "removed");
    assert.equal(manifest.rawJson, JSON.stringify({ kind: "signature" }));
  } finally {
    cleanup();
  }
});

function _insertScan(database: Database.Database, scanUuid: string, completedAt: string): number {
  return Number(
    database
      .prepare(
        `
          INSERT INTO package_scans(
            scan_uuid,
            owner,
            package_name,
            package_metadata_json,
            github_actions_run_url,
            scan_started_at,
            scan_completed_at,
            status
          )
          VALUES(?, ?, ?, ?, NULL, ?, ?, 'completed')
        `
      )
      .run(scanUuid, "acme", "demo", JSON.stringify({ visibility: "private" }), completedAt, completedAt)
      .lastInsertRowid
  );
}

function _seedOlderScan(database: Database.Database, scanId: number): void {
  _insertPackageVersion(database, scanId, 1, "2026-05-29T10:00:00.000Z");
  _insertPackageVersion(database, scanId, 2, "2026-05-29T10:00:00.000Z");
  _insertPackageVersion(database, scanId, 3, "2026-05-29T10:00:00.000Z");
  _insertTag(database, scanId, "single", 1);
  _insertTag(database, scanId, "single-amd64", 2);
  _insertTag(database, scanId, "moved-tag", 2);
  _insertTag(database, scanId, "sha256-ignored.sig", 3, 1);
  _insertManifest(
    database,
    scanId,
    1,
    "sha256:center",
    "application/vnd.oci.image.index.v1+json",
    "multi_arch_manifest"
  );
  _insertManifest(database, scanId, 2, "sha256:child", "application/vnd.oci.image.manifest.v1+json", "image_manifest");
  _insertManifest(
    database,
    scanId,
    3,
    "sha256:signature",
    "application/vnd.oci.image.manifest.v1+json",
    "signature_manifest",
    "sha256:center"
  );
  _insertPayload(database, scanId, "sha256:center", { kind: "center", scan: "older" });
  _insertPayload(database, scanId, "sha256:signature", { kind: "signature" });
  _insertEdge(database, scanId, "sha256:center", "sha256:child", "image-child");
  _insertEdge(database, scanId, "sha256:signature", "sha256:center", "referrer");
  _insertEdge(database, scanId, "sha256:child", "sha256:signature", "referrer");
  _insertDescriptor(database, scanId, "sha256:center", "sha256:child", "linux", "amd64");
}

function _seedNewerScan(database: Database.Database, scanId: number): void {
  _insertPackageVersion(database, scanId, 1, "2026-05-30T10:00:00.000Z");
  _insertPackageVersion(database, scanId, 4, "2026-05-30T10:00:00.000Z");
  _insertTag(database, scanId, "single", 1);
  _insertTag(database, scanId, "single-arm64", 4);
  _insertTag(database, scanId, "moved-tag", 4);
  _insertManifest(
    database,
    scanId,
    1,
    "sha256:center",
    "application/vnd.oci.image.index.v1+json",
    "multi_arch_manifest"
  );
  _insertManifest(database, scanId, 4, "sha256:arm64", "application/vnd.oci.image.manifest.v1+json", "image_manifest");
  _insertPayload(database, scanId, "sha256:center", { kind: "center", scan: "newer" });
  _insertPayload(database, scanId, "sha256:arm64", { kind: "arm64" });
  _insertEdge(database, scanId, "sha256:center", "sha256:arm64", "image-child");
  _insertDescriptor(database, scanId, "sha256:center", "sha256:arm64", "linux", "arm64");
}

function _insertPackageVersion(
  database: Database.Database,
  scanId: number,
  versionId: number,
  timestamp: string
): void {
  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(scanId, versionId, timestamp, timestamp);
}

function _insertTag(
  database: Database.Database,
  scanId: number,
  tag: string,
  versionId: number,
  isDigestTag = 0
): void {
  database
    .prepare("INSERT INTO tags(scan_id, tag, version_id, is_digest_tag) VALUES(?, ?, ?, ?)")
    .run(scanId, tag, versionId, isDigestTag);
}

function _insertManifest(
  database: Database.Database,
  scanId: number,
  versionId: number,
  digest: string,
  mediaType: string,
  manifestKind: string,
  subjectDigest: string | null = null
): void {
  database
    .prepare(
      `
        INSERT INTO manifests(
          scan_id,
          version_id,
          digest,
          media_type,
          artifact_type,
          config_media_type,
          subject_digest,
          annotations_json,
          manifest_kind
        )
        VALUES(?, ?, ?, ?, NULL, NULL, ?, NULL, ?)
      `
    )
    .run(scanId, versionId, digest, mediaType, subjectDigest, manifestKind);
}

function _insertPayload(database: Database.Database, scanId: number, digest: string, value: unknown): void {
  database
    .prepare("INSERT INTO manifest_payloads(scan_id, digest, raw_json) VALUES(?, ?, ?)")
    .run(scanId, digest, JSON.stringify(value));
}

function _insertEdge(
  database: Database.Database,
  scanId: number,
  parentDigest: string,
  childDigest: string,
  edgeKind: string
): void {
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(scanId, parentDigest, childDigest, edgeKind);
}

function _insertDescriptor(
  database: Database.Database,
  scanId: number,
  parentDigest: string,
  childDigest: string,
  platformOs: string,
  platformArchitecture: string
): void {
  database
    .prepare(
      `
        INSERT INTO manifest_descriptors(
          scan_id,
          parent_digest,
          child_digest,
          media_type,
          artifact_type,
          platform_os,
          platform_architecture,
          platform_variant
        )
        VALUES(?, ?, ?, ?, NULL, ?, ?, NULL)
      `
    )
    .run(
      scanId,
      parentDigest,
      childDigest,
      "application/vnd.oci.image.manifest.v1+json",
      platformOs,
      platformArchitecture
    );
}

function _initializeSchema(database: Database.Database): void {
  const sqlRoot = _resolveSqlRoot();
  for (const directoryName of ["schema", "views"]) {
    const sqlDirectory = join(sqlRoot, directoryName);
    for (const sqlFile of readdirSync(sqlDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      database.exec(readFileSync(join(sqlDirectory, sqlFile), "utf8"));
    }
  }
}

function _resolveSqlRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../resources/sql/", import.meta.url)),
    fileURLToPath(new URL("../../../resources/sql/", import.meta.url))
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("failed to locate resources/sql for visualizer tests");
}
