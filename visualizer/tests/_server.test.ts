import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { _resolveRuntimePaths, startVisualizerServer } from "../src/_server.js";

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
    const response = await fetch(
      `${server.url}/api/packages/acme/demo/graph?scan_id=1&compare_scan_id=2&center_digest=sha256:center&depth=1`
    );
    const body = (await response.json()) as {
      centerDigest: string;
      nodes: Array<{ digest: string; changeStatus: string }>;
    };
    assert.equal(response.status, 200);
    assert.equal(body.centerDigest, "sha256:center");
    assert.deepEqual(
      body.nodes
        .map((node) => ({ digest: node.digest, changeStatus: node.changeStatus }))
        .sort((left, right) => left.digest.localeCompare(right.digest)),
      [
        { digest: "sha256:arm64", changeStatus: "added" },
        { digest: "sha256:center", changeStatus: "unchanged" },
        { digest: "sha256:child", changeStatus: "removed" }
      ]
    );
  } finally {
    if (server) {
      await server.close();
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("visualizer server serves owner, package, and scan selector API responses", async () => {
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

    const ownersResponse = await fetch(`${server.url}/api/owners`);
    const owners = (await ownersResponse.json()) as Array<{ owner: string }>;
    assert.equal(ownersResponse.status, 200);
    assert.deepEqual(owners, [{ owner: "acme" }]);

    const packagesResponse = await fetch(`${server.url}/api/owners/acme/packages`);
    const packages = (await packagesResponse.json()) as Array<{ packageName: string }>;
    assert.equal(packagesResponse.status, 200);
    assert.deepEqual(packages, [{ packageName: "demo" }]);

    const scansResponse = await fetch(`${server.url}/api/packages/acme/demo/scans`);
    const scans = (await scansResponse.json()) as Array<{ scanId: number; scanCompletedAt: string }>;
    assert.equal(scansResponse.status, 200);
    assert.deepEqual(scans, [
      { scanId: 2, scanCompletedAt: "2026-05-30T10:00:00.000Z" },
      { scanId: 1, scanCompletedAt: "2026-05-29T10:00:00.000Z" }
    ]);

    const tagsResponse = await fetch(
      `${server.url}/api/packages/acme/demo/tags?scan_id=2&compare_scan_id=1&q=single&limit=20`
    );
    const tags = (await tagsResponse.json()) as Array<{ tagName: string }>;
    assert.equal(tagsResponse.status, 200);
    assert.deepEqual(tags, [{ tagName: "single" }]);
  } finally {
    if (server) {
      await server.close();
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("visualizer server resolves runtime asset paths for source and built installs", () => {
  assert.deepEqual(_resolveRuntimePaths("file:///tmp/ghcr-manager/visualizer/src/_server.js"), {
    publicDirectory: "/tmp/ghcr-manager/visualizer/public",
    cytoscapePath: "/tmp/ghcr-manager/node_modules/cytoscape/dist/cytoscape.esm.min.mjs"
  });
  assert.deepEqual(_resolveRuntimePaths("file:///tmp/npm/ghcr-manager-visualizer/dist/src/_server.js"), {
    publicDirectory: "/tmp/npm/ghcr-manager-visualizer/dist/public",
    cytoscapePath: "/tmp/npm/ghcr-manager-visualizer/node_modules/cytoscape/dist/cytoscape.esm.min.mjs"
  });
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
  const olderScanId = Number(
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
        "scan-uuid-older",
        "acme",
        "demo",
        JSON.stringify({ visibility: "private" }),
        "2026-05-29T10:00:00.000Z",
        "2026-05-29T10:00:00.000Z"
      ).lastInsertRowid
  );
  const newerScanId = Number(
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
        "scan-uuid-newer",
        "acme",
        "demo",
        JSON.stringify({ visibility: "private" }),
        "2026-05-30T10:00:00.000Z",
        "2026-05-30T10:00:00.000Z"
      ).lastInsertRowid
  );

  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(olderScanId, 1, "2026-05-29T10:00:00.000Z", "2026-05-29T10:00:00.000Z");
  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(olderScanId, 2, "2026-05-29T10:00:00.000Z", "2026-05-29T10:00:00.000Z");
  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(newerScanId, 1, "2026-05-30T10:00:00.000Z", "2026-05-30T10:00:00.000Z");
  database
    .prepare("INSERT INTO package_versions(scan_id, version_id, created_at, updated_at) VALUES(?, ?, ?, ?)")
    .run(newerScanId, 3, "2026-05-30T10:00:00.000Z", "2026-05-30T10:00:00.000Z");
  database
    .prepare("INSERT INTO tags(scan_id, tag, version_id, is_digest_tag) VALUES(?, ?, ?, ?)")
    .run(olderScanId, "single", 1, 0);
  database
    .prepare("INSERT INTO tags(scan_id, tag, version_id, is_digest_tag) VALUES(?, ?, ?, ?)")
    .run(newerScanId, "single", 1, 0);
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
    .run(olderScanId, 1, "sha256:center", "application/vnd.oci.image.index.v1+json", "multi_arch_manifest");
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
    .run(olderScanId, 2, "sha256:child", "application/vnd.oci.image.manifest.v1+json", "image_manifest");
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
    .run(newerScanId, 1, "sha256:center", "application/vnd.oci.image.index.v1+json", "multi_arch_manifest");
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
    .run(newerScanId, 3, "sha256:arm64", "application/vnd.oci.image.manifest.v1+json", "image_manifest");
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(olderScanId, "sha256:center", "sha256:child", "image-child");
  database
    .prepare("INSERT INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind) VALUES(?, ?, ?, ?)")
    .run(newerScanId, "sha256:center", "sha256:arm64", "image-child");
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
