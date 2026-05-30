#!/usr/bin/env node
/* global process */

import {
  buildAndPushImage,
  deletePackageVersion,
  findPackageVersionByTag,
  parseArgs,
  publishSyntheticIndex,
  runGhcrManagerCleanup
} from "./_ghcr-visual-demo-lib.mjs";

const _helpText = `
Apply the second-step mutation for the manual GHCR visual compare demo package.

This updates the seeded graph to create visible compare changes:
- deletes visual-demo--drop-multiarch
- removes visual-demo--drop-tag from the retained shared image
- adds visual-demo--added-leaf
- adds visual-demo--added-multiarch

Usage:
  node tools/tests/visualizer/visual-demo-update.mjs <owner> <package-name> <registry-username> <token>

Token with gh:
  TOKEN="$(gh auth token)"

Example:
  node tools/tests/visualizer/visual-demo-update.mjs ghcr-manager-test my-visual-demo stefan "$TOKEN"

How to use:
  1. Run tools/tests/visualizer/visual-demo-seed.mjs and scan once.
  2. Run this update script.
  3. Run a second scan.
  4. Compare both scans in the visualizer.
  5. Start from tag visual-demo--keep-image to see unchanged, removed, added, and removed-tag states together.
`.trim();

const options = parseArgs(_helpText);

const deletedMultiarch = await findPackageVersionByTag(
  options.owner,
  options.packageName,
  options.token,
  "visual-demo--drop-multiarch"
);
await deletePackageVersion(options.owner, options.packageName, options.token, deletedMultiarch.versionId);

runGhcrManagerCleanup({
  owner: options.owner,
  packageName: options.packageName,
  token: options.token,
  deleteTag: "visual-demo--drop-tag"
});

const sharedImage = await findPackageVersionByTag(
  options.owner,
  options.packageName,
  options.token,
  "visual-demo--keep-image"
);
const addedLeafDigest = buildAndPushImage(options.imageRef, "visual-demo--added-leaf", "visual demo added leaf");

await publishSyntheticIndex({
  owner: options.owner,
  packageName: options.packageName,
  registryUsername: options.registryUsername,
  token: options.token,
  tag: "visual-demo--added-multiarch",
  members: [
    { digest: sharedImage.digest, os: "linux", architecture: "amd64" },
    { digest: addedLeafDigest, os: "linux", architecture: "s390x" }
  ]
});

process.stdout.write(
  [
    `Updated ghcr.io/${options.owner}/${options.packageName}`,
    "Applied changes:",
    "  - deleted visual-demo--drop-multiarch",
    "  - removed visual-demo--drop-tag from the retained shared image",
    "  - added visual-demo--added-leaf",
    "  - added visual-demo--added-multiarch"
  ].join("\n") + "\n"
);
