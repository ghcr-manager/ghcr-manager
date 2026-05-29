import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { GraphRepository } from "../src/_graph-repository.js";

function _createRepository() {
  const directory = mkdtempSync(join(tmpdir(), "ghcr-visualizer-"));
  const databasePath = join(directory, "scan.sqlite");
  const database = new Database(databasePath);
  _initializeSchema(database);
  const scanId = Number(
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
      .run(
        "scan-uuid",
        "acme",
        "demo",
        JSON.stringify({ visibility: "private" }),
        "2026-05-29T10:00:00.000Z",
        "2026-05-29T10:00:00.000Z"
      ).lastInsertRowid
  );

  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(scanId, 1, "2026-05-29T10:00:00.000Z", "2026-05-29T10:00:00.000Z");
  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(scanId, 2, "2026-05-29T10:00:00.000Z", "2026-05-29T10:00:00.000Z");
  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(scanId, 3, "2026-05-29T10:00:00.000Z", "2026-05-29T10:00:00.000Z");
  database
    .prepare("INSERT INTO tags(scan_id, tag, version_id, is_digest_tag) VALUES(?, ?, ?, ?)")
    .run(scanId, "single", 1, 0);
  database
    .prepare("INSERT INTO tags(scan_id, tag, version_id, is_digest_tag) VALUES(?, ?, ?, ?)")
    .run(scanId, "single-amd64", 2, 0);
  database
    .prepare("INSERT INTO tags(scan_id, tag, version_id, is_digest_tag) VALUES(?, ?, ?, ?)")
    .run(scanId, "sha256-ignored.sig", 3, 1);
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
        VALUES(?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)
      `
    )
    .run(scanId, 1, "sha256:center", "application/vnd.oci.image.index.v1+json", "multi_arch_manifest");
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
        VALUES(?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)
      `
    )
    .run(scanId, 2, "sha256:child", "application/vnd.oci.image.manifest.v1+json", "image_manifest");
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
    .run(
      scanId,
      3,
      "sha256:signature",
      "application/vnd.oci.image.manifest.v1+json",
      "sha256:center",
      "signature_manifest"
    );
  database
    .prepare("INSERT INTO manifest_payloads(scan_id, digest, raw_json) VALUES(?, ?, ?)")
    .run(scanId, "sha256:center", JSON.stringify({ kind: "center" }));
  database
    .prepare("INSERT INTO manifest_payloads(scan_id, digest, raw_json) VALUES(?, ?, ?)")
    .run(scanId, "sha256:signature", JSON.stringify({ kind: "signature" }));
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(scanId, "sha256:center", "sha256:child", "image-child");
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(scanId, "sha256:signature", "sha256:center", "referrer");
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(scanId, "sha256:child", "sha256:signature", "referrer");
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
    .run(scanId, "sha256:center", "sha256:child", "application/vnd.oci.image.manifest.v1+json", "linux", "amd64");

  const repository = new GraphRepository(database);
  const cleanup = () => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  };

  return { repository, cleanup };
}

test("graph repository resolves the latest scan and manifest by tag", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const manifest = repository.resolveManifest("acme", "demo", undefined, { tag: "single" });
    assert.equal(manifest.scanId > 0, true);
    assert.equal(manifest.digest, "sha256:center");
    assert.deepEqual(manifest.tags, ["single"]);
  } finally {
    cleanup();
  }
});

test("graph repository returns visible intra-neighborhood edges and omits digest tags from labels", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const graph = repository.getGraph("acme", "demo", undefined, "sha256:center", 1);
    assert.equal(graph.centerDigest, "sha256:center");
    assert.deepEqual(
      graph.nodes
        .map((node) => ({ digest: node.digest, tags: node.tags, displayPlatform: node.displayPlatform }))
        .sort((left, right) => left.digest.localeCompare(right.digest)),
      [
        { digest: "sha256:center", tags: ["single"], displayPlatform: null },
        { digest: "sha256:child", tags: ["single-amd64"], displayPlatform: "linux/amd64" },
        { digest: "sha256:signature", tags: [], displayPlatform: null }
      ]
    );
    assert.deepEqual(graph.edges.map((edge) => edge.kind).sort(), ["image-child", "referrer", "referrer"]);
    assert.equal(
      graph.edges.some(
        (edge) => edge.from === "sha256:child" && edge.to === "sha256:signature" && edge.kind === "referrer"
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
    const manifest = repository.getManifest("acme", "demo", undefined, "sha256:signature");
    assert.equal(manifest.manifestKind, "signature_manifest");
    assert.equal(manifest.rawJson, JSON.stringify({ kind: "signature" }));
    assert.equal(manifest.displayPlatform, null);
    assert.deepEqual(manifest.tags, []);
  } finally {
    cleanup();
  }
});

test("graph repository derives a display platform for image-manifest media types from descriptors", () => {
  const { repository, cleanup } = _createRepository();
  try {
    const manifest = repository.getManifest("acme", "demo", undefined, "sha256:child");
    assert.equal(manifest.mediaType, "application/vnd.oci.image.manifest.v1+json");
    assert.equal(manifest.displayPlatform, "linux/amd64");
  } finally {
    cleanup();
  }
});

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
