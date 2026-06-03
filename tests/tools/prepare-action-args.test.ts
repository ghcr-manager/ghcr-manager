import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
const { buildCleanupArgs, writeArgsFile, writeGitHubOutputs } = await import(
  new URL("../../tools/prepare-action-args.mjs", import.meta.url).href
);

test("buildCleanupArgs assembles cleanup argv from action env", () => {
  const invocation = buildCleanupArgs({
    DB_PATH: "/tmp/run.sqlite",
    DELETE_GHOST_IMAGES: "false",
    DELETE_ORPHANED_IMAGES: "true",
    DELETE_PARTIAL_IMAGES: "false",
    DELETE_TAGS: " latest \nold \n\n",
    DELETE_UNTAGGED: "true",
    DRY_RUN: "false",
    EXCLUDE_TAGS: "keep \n keep-two ",
    KEEP_N_TAGGED: "2",
    KEEP_N_UNTAGGED: "",
    LOG_LEVEL: "debug",
    OLDER_THAN: "30d",
    OWNER: "acme",
    PACKAGE: "example",
    TOKEN: "secret",
    USE_REGEX: "true"
  });

  assert.equal(invocation.summaryPath, "/tmp/run.sqlite--cleanup-summary.json");
  assert.equal(invocation.summaryFile, "run.sqlite--cleanup-summary.json");
  assert.deepEqual(invocation.args, [
    "--db",
    "/tmp/run.sqlite",
    "--log-level",
    "debug",
    "--owner",
    "acme",
    "--package",
    "example",
    "--summary-json-path",
    "/tmp/run.sqlite--cleanup-summary.json",
    "--token",
    "secret",
    "--delete-untagged",
    "--delete-orphaned-images",
    "--use-regex",
    "--keep-n-tagged",
    "2",
    "--older-than",
    "30d",
    "--delete-tag",
    "latest",
    "--delete-tag",
    "old",
    "--exclude-tag",
    "keep",
    "--exclude-tag",
    "keep-two"
  ]);
});

test("writeArgsFile persists NUL-delimited argv entries", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));

  try {
    const argsPath = writeArgsFile(["--owner", "acme", "--delete-tag", "release candidate"], tempDirectory);
    assert.equal(readFileSync(argsPath, "utf8"), "--owner\0acme\0--delete-tag\0release candidate\0");
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("writeGitHubOutputs appends action outputs", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "ghcr-manager-"));
  const outputPath = join(tempDirectory, "github-output.txt");

  try {
    writeGitHubOutputs(outputPath, {
      args_path: "/tmp/argv.bin",
      summary_path: "/tmp/summary.json"
    });

    assert.equal(readFileSync(outputPath, "utf8"), "args_path=/tmp/argv.bin\nsummary_path=/tmp/summary.json\n");
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
