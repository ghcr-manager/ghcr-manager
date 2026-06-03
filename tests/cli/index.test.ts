import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "../../src/cli/index.js";
import { openDatabase, ScanWriter } from "../../src/db/index.js";
import { importFileScan } from "../helpers/index.js";

test("main returns 1 when no command is provided", async () => {
  assert.equal(await main([]), 1);
});

test("main throws for an unknown command", async () => {
  await assert.rejects(() => main(["unknown"]), /unknown command: unknown/);
});

test("main dispatches the cleanup dry-run command", async () => {
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
      await main([
        "cleanup",
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
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  assert.equal(writes.length, 1);
});

test("main dispatches the cleanup command", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const database = openDatabase(databasePath);
  const writer = new ScanWriter(database);
  await importFileScan("tests/fixtures/sample-package.json", writer);
  database.close();

  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const writes: string[] = [];

  globalThis.fetch = async (input) => {
    if (String(input) === "https://api.github.com/users/acme") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return { type: "Organization" };
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
  };
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(
      await main([
        "cleanup",
        "--db",
        databasePath,
        "--owner",
        "acme",
        "--package",
        "example",
        "--token",
        "token",
        "--delete-untagged"
      ]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  assert.equal(writes.length, 1);
});

test("main dispatches the scan command", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const databasePath = join(tempDirectory, "scan.sqlite");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://ghcr.io/token?scope=repository%3Aacme%2Fexample%3Apull&service=ghcr.io") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return { token: "registry-token" };
        }
      } as Response;
    }
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
    if (url === "https://api.github.com/orgs/acme/packages/container/example") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return { name: "example", visibility: "private" };
        }
      } as Response;
    }
    if (url === "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        async json() {
          return [];
        }
      } as Response;
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  try {
    assert.equal(
      await main(["scan", "--db", databasePath, "--owner", "acme", "--package", "example", "--token", "token"]),
      0
    );
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("main dispatches the db-merge command", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const targetPath = join(tempDirectory, "merged.sqlite");
  const sourcePath = join(tempDirectory, "source.sqlite");
  const database = openDatabase(sourcePath);
  database.close();

  const originalLog = console.log;
  const writes: string[] = [];
  console.log = (message?: unknown) => {
    writes.push(String(message));
  };

  try {
    assert.equal(await main(["db-merge", "--db", targetPath, "--source-db", sourcePath]), 0);
  } finally {
    console.log = originalLog;
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  assert.equal(writes.length, 1);
});
