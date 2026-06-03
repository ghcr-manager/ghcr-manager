#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleCleanup } from "./_cleanup-command.js";
import { handleDbMerge } from "./_db-merge-command.js";
import { handleScan } from "./_scan-command.js";

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command) {
    printUsage();
    return 1;
  }

  switch (command) {
    case "cleanup":
      return handleCleanup(rest);
    case "db-merge":
      return handleDbMerge(rest);
    case "scan":
      return handleScan(rest);
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

function printUsage(): void {
  console.error(`Usage:
  ghcr-manager cleanup --db <path> [--log-level <trace|debug|info|warn|error|silent>] [--dry-run] [--summary-json-path <path>] --owner <org> --package <name> [--token <token>] <cleanup selectors...> [--exclude-tag <tag> ...] [--use-regex] [--older-than <interval>]
  ghcr-manager db-merge --db <target-path> --source-db <path> [--source-db <path> ...]
  ghcr-manager scan --db <path> [--log-level <trace|debug|info|warn|error|silent>] [--github-output <path>] --owner <org> --package <name> --token <token>

Cleanup selectors:
  --delete-untagged
  --delete-ghost-images
  --delete-partial-images
  --delete-orphaned-images
  --delete-tag <tag> [--delete-tag <tag> ...]
  --keep-n-tagged <count>
  --keep-n-untagged <count>

Notes:
  - Tagged selector families may be combined with --delete-untagged.
  - --exclude-tag requires at least one tagged selector family.
  - --delete-untagged and --keep-n-untagged cannot be combined.`);
}

const _entryPath = process.argv[1];
const _isDirectExecution = realpathSync(_entryPath) === realpathSync(fileURLToPath(import.meta.url));

if (_isDirectExecution) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
