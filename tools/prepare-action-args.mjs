#!/usr/bin/env node
/* global process */

import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function buildCleanupArgs(env) {
  const summaryPath = `${_requireEnv(env, "DB_PATH")}--cleanup-summary.json`;
  return {
    args: [
      "--db",
      _requireEnv(env, "DB_PATH"),
      "--log-level",
      _requireEnv(env, "LOG_LEVEL"),
      "--owner",
      _requireEnv(env, "OWNER"),
      "--package",
      _requireEnv(env, "PACKAGE"),
      "--summary-json-path",
      summaryPath,
      ...(_isTrue(env.DRY_RUN) ? ["--dry-run"] : ["--token", _requireEnv(env, "TOKEN")]),
      ..._flag(env.DELETE_UNTAGGED, "--delete-untagged"),
      ..._flag(env.DELETE_GHOST_IMAGES, "--delete-ghost-images"),
      ..._flag(env.DELETE_PARTIAL_IMAGES, "--delete-partial-images"),
      ..._flag(env.DELETE_ORPHANED_IMAGES, "--delete-orphaned-images"),
      ..._flag(env.USE_REGEX, "--use-regex"),
      ..._option(env.KEEP_N_TAGGED, "--keep-n-tagged"),
      ..._option(env.KEEP_N_UNTAGGED, "--keep-n-untagged"),
      ..._option(env.OLDER_THAN, "--older-than"),
      ..._lineOptions(env.DELETE_TAGS, "--delete-tag"),
      ..._lineOptions(env.EXCLUDE_TAGS, "--exclude-tag")
    ],
    summaryFile: path.basename(summaryPath),
    summaryPath
  };
}

export function writeArgsFile(args, directory) {
  const argsDirectory = mkdtempSync(path.join(directory, "ghcr-manager-args-"));
  const argsPath = path.join(argsDirectory, "argv.bin");
  writeFileSync(argsPath, args.map((arg) => `${arg}\0`).join(""), "utf8");
  return argsPath;
}

export function writeGitHubOutputs(outputPath, outputs) {
  if (!outputPath) {
    return;
  }

  appendFileSync(
    outputPath,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    "utf8"
  );
}

function _flag(rawValue, flag) {
  return _isTrue(rawValue) ? [flag] : [];
}

function _option(rawValue, optionName) {
  return rawValue ? [optionName, rawValue] : [];
}

function _lineOptions(rawValues, optionName) {
  if (!rawValues) {
    return [];
  }

  return rawValues
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .flatMap((value) => [optionName, value]);
}

function _isTrue(value) {
  return value === "true";
}

function _requireEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function _main(argv) {
  const [command] = argv;
  const tempRoot = process.env.RUNNER_TEMP || tmpdir();

  if (command === "cleanup") {
    const invocation = buildCleanupArgs(process.env);
    writeGitHubOutputs(process.env.GITHUB_OUTPUT, {
      args_path: writeArgsFile(invocation.args, tempRoot),
      summary_file: invocation.summaryFile,
      summary_path: invocation.summaryPath
    });
    return;
  }

  throw new Error("usage: node tools/prepare-action-args.mjs <cleanup>");
}

const _isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (_isDirectExecution) {
  _main(process.argv.slice(2));
}
