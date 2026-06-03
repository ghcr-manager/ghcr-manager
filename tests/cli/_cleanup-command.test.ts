import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleCleanup } from "../../src/cli/_cleanup-command.js";
import { ManifestKinds } from "../../src/core/index.js";
import {
  DeletePlanValidationReasonCodes,
  DeletePlanValidationStatuses,
  openDatabase,
  ScanWriter
} from "../../src/db/index.js";
import { importFileScan } from "../helpers/index.js";

test("handleCleanup dry-run does not require a token", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleCleanup([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--dry-run",
        "--delete-untagged"
      ]),
      0
    );
  } finally {
    console.log = originalLog;
  }

  const summary = JSON.parse(writes[0] as string) as {
    dryRun: boolean;
    plannerInputs: { deleteUntagged: boolean };
    affectedManifests: Array<{ digest: string }>;
  };
  assert.equal(summary.dryRun, true);
  assert.equal(summary.plannerInputs.deleteUntagged, true);
  assert.equal(summary.affectedManifests.length, 1);

  const persistedDatabase = openDatabase(databasePath);
  const cleanupRun = persistedDatabase
    .prepare(
      `
        SELECT dry_run, direct_target_root_count
        FROM cleanup_runs
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get() as {
    dry_run: number;
    direct_target_root_count: number;
  };
  assert.equal(cleanupRun.dry_run, 1);
  assert.equal(cleanupRun.direct_target_root_count, 1);
  persistedDatabase.close();
  rmSync(tempDirectory, { recursive: true, force: true });
});

test("handleCleanup writes summary JSON to a file when requested", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const summaryPath = join(tempDirectory, "cleanup-summary.json");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleCleanup([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--dry-run",
        "--delete-untagged",
        "--summary-json-path",
        summaryPath
      ]),
      0
    );
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(writes, []);
  const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as {
    dryRun: boolean;
    plannerInputs: { deleteUntagged: boolean };
  };
  assert.equal(summary.dryRun, true);
  assert.equal(summary.plannerInputs.deleteUntagged, true);

  rmSync(tempDirectory, { recursive: true, force: true });
});

test("handleCleanup live mode requires a token", async () => {
  await assert.rejects(
    () => handleCleanup(["--db", "scan.sqlite", "--owner", "acme", "--package", "example", "--delete-untagged"]),
    /missing required option: --token/
  );
});

test("handleCleanup live mode persists a cleanup run before execution", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleCleanup([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "token",
        "--keep-n-tagged",
        "2"
      ]),
      0
    );
  } finally {
    console.log = originalLog;
  }

  const summary = JSON.parse(writes[0] as string) as {
    deletedPackageVersionCount: number;
    detachedTagCount: number;
  };
  assert.equal(summary.deletedPackageVersionCount, 0);
  assert.equal(summary.detachedTagCount, 0);

  const persistedDatabase = openDatabase(databasePath);
  const cleanupRun = persistedDatabase
    .prepare(
      `
        SELECT dry_run, direct_target_root_count
        FROM cleanup_runs
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get() as {
    dry_run: number;
    direct_target_root_count: number;
  };
  assert.equal(cleanupRun.dry_run, 0);
  assert.equal(cleanupRun.direct_target_root_count, 0);
  persistedDatabase.close();
  rmSync(tempDirectory, { recursive: true, force: true });
});

test("handleCleanup dry-run persists tagged fully-deletable cleanup decisions", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await handleCleanup([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--dry-run",
        "--delete-tag",
        "latest"
      ]),
      0
    );
  } finally {
    console.log = originalLog;
  }

  const summary = JSON.parse(writes[0] as string) as {
    fullyDeletableRoots: Array<{ validationStatus: string; selectionMode: string }>;
    affectedManifests: Array<{ digest: string }>;
  };
  assert.equal(summary.fullyDeletableRoots.length, 1);
  assert.equal(summary.fullyDeletableRoots[0]?.validationStatus, DeletePlanValidationStatuses.fullyDeletable);
  assert.equal(summary.fullyDeletableRoots[0]?.selectionMode, "delete-root");
  assert.equal(summary.affectedManifests.length, 2);
  assert.deepEqual(
    summary.affectedManifests.map((manifest) => manifest.digest),
    ["sha256:attestation-old", "sha256:index-current"]
  );

  const persistedDatabase = openDatabase(databasePath);
  const cleanupRun = persistedDatabase
    .prepare(
      `
        SELECT dry_run
             , direct_target_root_count
             , untag_only_root_count
             , fully_deletable_root_count
        FROM cleanup_runs
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get() as {
    dry_run: number;
    direct_target_root_count: number;
    untag_only_root_count: number;
    fully_deletable_root_count: number;
  };
  assert.equal(cleanupRun.dry_run, 1);
  assert.equal(cleanupRun.direct_target_root_count, 1);
  assert.equal(cleanupRun.untag_only_root_count, 0);
  assert.equal(cleanupRun.fully_deletable_root_count, 1);
  persistedDatabase.close();
  rmSync(tempDirectory, { recursive: true, force: true });
});

test("handleCleanup live mode applies untag-only roots and records cleanup audit rows", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);

  writer.startScan("acme", "example", "2026-05-17T09:00:00.000Z", {
    rawJson: JSON.stringify({ visibility: "private" })
  });
  writer.insertPackageVersion({
    versionId: 101,
    createdAt: "2026-05-17T08:00:00.000Z",
    updatedAt: "2026-05-17T08:00:00.000Z"
  });
  writer.insertTag({ versionId: 101, tag: "keep-me" });
  writer.insertTag({ versionId: 101, tag: "latest" });
  writer.insertManifest({
    versionId: 101,
    digest: "sha256:index-current",
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    manifestKind: ManifestKinds.imageManifest
  });
  writer.markScanCompleted("2026-05-17T09:00:00.000Z");
  database.close();

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const writes: string[] = [];
  let detachedDigest = "sha256:detached";
  let latestVisible = true;
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);

    if (url === "https://api.github.com/users/acme") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return { type: "Organization" };
        }
      } as Response;
    }

    if (url.startsWith("https://ghcr.io/token")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return { token: "registry-token" };
        }
      } as Response;
    }

    if (url === "https://ghcr.io/v2/acme/example/manifests/sha256:index-current") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/vnd.oci.image.manifest.v1+json" }),
        async json() {
          return {
            schemaVersion: 2,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: "sha256:config", size: 1 },
            layers: []
          };
        }
      } as Response;
    }

    if (url === "https://ghcr.io/v2/acme/example/manifests/latest") {
      const crypto = await import("node:crypto");
      detachedDigest = `sha256:${crypto
        .createHash("sha256")
        .update(String(init?.body ?? ""))
        .digest("hex")}`;
      return {
        ok: true,
        status: 201,
        headers: new Headers(),
        async json() {
          return {};
        }
      } as Response;
    }

    if (url === "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1") {
      if (!latestVisible) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [];
          }
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return [
            {
              id: 303,
              name: detachedDigest,
              metadata: {
                container: {
                  tags: ["latest"]
                }
              }
            }
          ];
        }
      } as Response;
    }

    if (
      url === "https://api.github.com/orgs/acme/packages/container/example/versions/303" &&
      init?.method === "DELETE"
    ) {
      latestVisible = false;
      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        async json() {
          return {};
        }
      } as Response;
    }

    return {
      ok: true,
      status: 204,
      headers: new Headers(),
      async json() {
        return {};
      }
    } as Response;
  }) as typeof fetch;

  try {
    assert.equal(
      await handleCleanup([
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "token",
        "--delete-tag",
        "latest"
      ]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }

  const summary = JSON.parse(writes[0] as string) as {
    deletedPackageVersionCount: number;
    detachedTagCount: number;
  };
  assert.equal(summary.deletedPackageVersionCount, 0);
  assert.equal(summary.detachedTagCount, 1);

  const persistedDatabase = openDatabase(databasePath);
  const cleanupRun = persistedDatabase
    .prepare(
      `
        SELECT dry_run
             , direct_target_root_count
             , untag_only_root_count
             , fully_deletable_root_count
        FROM cleanup_runs
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get() as {
    dry_run: number;
    direct_target_root_count: number;
    untag_only_root_count: number;
    fully_deletable_root_count: number;
  };
  assert.equal(cleanupRun.dry_run, 0);
  assert.equal(cleanupRun.direct_target_root_count, 1);
  assert.equal(cleanupRun.untag_only_root_count, 1);
  assert.equal(cleanupRun.fully_deletable_root_count, 0);

  const rootDecision = persistedDatabase
    .prepare(
      `
        SELECT validation_status, validation_reason_code
        FROM cleanup_root_decisions
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get() as {
    validation_status: string;
    validation_reason_code: string;
  };
  assert.equal(rootDecision.validation_status, DeletePlanValidationStatuses.untagOnly);
  assert.equal(rootDecision.validation_reason_code, DeletePlanValidationReasonCodes.untagOnlyPartialTagMatch);
  persistedDatabase.close();
  rmSync(tempDirectory, { recursive: true, force: true });
});
