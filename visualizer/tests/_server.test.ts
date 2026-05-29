import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { startVisualizerServer } from "../src/_server.js";

test("visualizer server serves graph API responses from a read-only database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ghcr-visualizer-server-"));
  const databasePath = join(directory, "scan.sqlite");
  const database = new Database(databasePath);
  initializeSchema(database);
  seedDatabase(database);
  database.close();

  let server;
  try {
    server = await startVisualizerServer({
      databasePath,
      host: "127.0.0.1",
      port: 0
    });
    const response = await fetch(`${server.url}/api/packages/acme/demo/graph?center_digest=sha256:center&depth=1`);
    const body = (await response.json()) as { centerDigest: string; nodes: Array<{ digest: string }> };
    assert.equal(response.status, 200);
    assert.equal(body.centerDigest, "sha256:center");
    assert.deepEqual(body.nodes.map((node) => node.digest).sort(), [
      "sha256:center",
      "sha256:child",
      "sha256:signature"
    ]);
  } finally {
    if (server) {
      await server.close();
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function initializeSchema(database: Database.Database): void {
  const sqlRoot = resolveSqlRoot();
  for (const directoryName of ["schema", "views"]) {
    const sqlDirectory = join(sqlRoot, directoryName);
    for (const sqlFile of readdirSync(sqlDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      database.exec(readFileSync(join(sqlDirectory, sqlFile), "utf8"));
    }
  }
}

function seedDatabase(database: Database.Database): void {
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
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(scanId, "sha256:center", "sha256:child", "image-child");
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(scanId, "sha256:signature", "sha256:center", "referrer");
}

function resolveSqlRoot(): string {
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
