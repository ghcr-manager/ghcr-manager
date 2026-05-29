#!/usr/bin/env node
/* global console, process */

import { access, readdir } from "node:fs/promises";
import path from "node:path";

const violations = [];
const mappings = [
  { srcRoot: path.resolve("src"), testsRoot: path.resolve("tests") },
  { srcRoot: path.resolve("visualizer/src"), testsRoot: path.resolve("visualizer/tests") }
];

for (const mapping of mappings) {
  if (await exists(mapping.srcRoot)) {
    await walk(mapping.srcRoot, mapping.testsRoot);
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exitCode = 1;
}

async function walk(directoryPath, testsRoot) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, testsRoot);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    const relativePath = path.relative(path.dirname(testsRoot), entryPath).replace(/^src[\\/]/, "");
    const expectedTestPath = path.join(testsRoot, relativePath.replace(/\.ts$/, ".test.ts"));

    try {
      await access(expectedTestPath);
    } catch {
      violations.push(`Missing mapped test file: ${path.relative(process.cwd(), expectedTestPath)}`);
    }
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
