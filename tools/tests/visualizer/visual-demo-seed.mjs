#!/usr/bin/env node
/* global process */

import {
  buildAndPushImage,
  deletePackageIfPresent,
  parseArgs,
  publishSyntheticIndex
} from "./_ghcr-visual-demo-lib.mjs";

const _helpText = `
Seed the manual GHCR visual compare demo package.

This resets the target package and creates the initial graph:
- shared image tag: visual-demo--keep-image
- kept image tag: visual-demo--kept-leaf
- kept multi-arch tag: visual-demo--keep-multiarch
- removed-later multi-arch tag: visual-demo--drop-multiarch

Usage:
  node tools/tests/visualizer/visual-demo-seed.mjs <owner> <package-name> <registry-username> <token>

Token with gh:
  gh auth refresh -h github.com -s read:packages -s write:packages -s delete:packages
  TOKEN="$(gh auth token)"
  echo "$TOKEN" | docker login ghcr.io -u <registry-username> --password-stdin

Example:
  gh auth refresh -h github.com -s read:packages -s write:packages -s delete:packages
  TOKEN="$(gh auth token)"
  echo "$TOKEN" | docker login ghcr.io -u my-username --password-stdin
  node tools/tests/visualizer/visual-demo-seed.mjs ghcr-manager-test my-visual-demo my-username "$TOKEN"

How to use:
  1. Run this seed script.
  2. Run a scan and note the scan id.
  3. Run tools/tests/visualizer/visual-demo-update.mjs.
  4. Run a second scan.
  5. Compare the two scans in the visualizer.
`.trim();

const options = parseArgs(_helpText);

await deletePackageIfPresent(options.owner, options.packageName, options.token);

const sharedImageDigest = buildAndPushImage(options.imageRef, "visual-demo--keep-image", "visual demo shared image");
const keptLeafDigest = buildAndPushImage(options.imageRef, "visual-demo--kept-leaf", "visual demo kept leaf");

await publishSyntheticIndex({
  owner: options.owner,
  packageName: options.packageName,
  registryUsername: options.registryUsername,
  token: options.token,
  tag: "visual-demo--keep-multiarch",
  members: [
    { digest: sharedImageDigest, os: "linux", architecture: "amd64" },
    { digest: keptLeafDigest, os: "linux", architecture: "arm64" }
  ]
});

await publishSyntheticIndex({
  owner: options.owner,
  packageName: options.packageName,
  registryUsername: options.registryUsername,
  token: options.token,
  tag: "visual-demo--drop-multiarch",
  members: [
    { digest: sharedImageDigest, os: "linux", architecture: "amd64" },
    { digest: keptLeafDigest, os: "linux", architecture: "ppc64le" }
  ]
});

process.stdout.write(
  [
    `Seeded ghcr.io/${options.owner}/${options.packageName}`,
    "Tags:",
    "  - visual-demo--keep-image",
    "  - visual-demo--kept-leaf",
    "  - visual-demo--keep-multiarch",
    "  - visual-demo--drop-multiarch"
  ].join("\n") + "\n"
);
