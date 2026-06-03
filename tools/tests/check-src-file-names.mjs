#!/usr/bin/env node
/* global console, process */

import { access, readdir } from "node:fs/promises";
import path from "node:path";

const violations = [];
const srcRoots = [path.resolve("src"), path.resolve("visualizer/src")];

for (const srcRoot of srcRoots) {
  if (await exists(srcRoot)) {
    await walk(srcRoot);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exitCode = 1;
}

async function walk(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    if (entry.name === "index.ts" || entry.name.startsWith("_")) {
      continue;
    }

    violations.push(
      `Non-public TypeScript source files in src/ must start with _: ${path.relative(process.cwd(), entryPath)}`
    );
  }
}

async function exists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}
