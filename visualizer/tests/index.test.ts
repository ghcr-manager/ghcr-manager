import assert from "node:assert/strict";
import test from "node:test";
import type { VisualizerServerHandle } from "../src/index.js";
import { main, parseArgs, resolveDatabasePath } from "../src/index.js";

test("parseArgs resolves the required database argument and defaults host and port", () => {
  assert.deepEqual(parseArgs(["--db", "scan.sqlite"]), {
    databasePath: "scan.sqlite",
    host: "127.0.0.1",
    port: 0
  });
});

test("parseArgs rejects missing database arguments", () => {
  assert.throws(() => parseArgs([]), /missing required option: --db/);
});

test("resolveDatabasePath prefers the npm invocation root for relative paths", () => {
  const originalInitCwd = process.env.INIT_CWD;
  process.env.INIT_CWD = "/tmp/worktree";
  try {
    assert.equal(resolveDatabasePath("artifacts/scan.sqlite"), "/tmp/worktree/artifacts/scan.sqlite");
  } finally {
    if (originalInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = originalInitCwd;
    }
  }
});

test("main passes resolved options to the server starter", async () => {
  const originalListeners = process.listeners("SIGINT");
  const originalInitCwd = process.env.INIT_CWD;
  process.env.INIT_CWD = "/tmp/visualizer-root";
  let received:
    | {
        databasePath: string;
        host: string;
        port: number;
      }
    | undefined;
  await main(["--db", "scan.sqlite", "--host", "0.0.0.0", "--port", "4000"], async (options) => {
    received = options;
    return {
      url: "http://127.0.0.1:0",
      async close(): Promise<void> {}
    } satisfies VisualizerServerHandle;
  });
  for (const listener of process.listeners("SIGINT")) {
    if (!originalListeners.includes(listener)) {
      process.removeListener("SIGINT", listener);
    }
  }
  assert.equal(received?.host, "0.0.0.0");
  assert.equal(received?.port, 4000);
  assert.equal(received?.databasePath, "/tmp/visualizer-root/scan.sqlite");
  if (originalInitCwd === undefined) {
    delete process.env.INIT_CWD;
  } else {
    process.env.INIT_CWD = originalInitCwd;
  }
});
