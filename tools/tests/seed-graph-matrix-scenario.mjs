#!/usr/bin/env node
/* global process */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectDigest, publishSyntheticIndex } from "./visualizer/_ghcr-visual-demo-lib.mjs";

const [scenarioId, imageRef] = process.argv.slice(2);

if (!scenarioId || !imageRef) {
  throw new Error("usage: node tools/tests/seed-graph-matrix-scenario.mjs <scenario-id> <image-ref>");
}

const scenario = _resolveScenario(scenarioId);
const dummyImage = _buildImage(imageRef, "keep-dummy", `${scenarioId} keep-dummy`, "plain", "amd64");
const images = [];
for (const imageSpec of scenario.images) {
  const image = _buildImage(
    imageRef,
    imageSpec.tag,
    `${scenarioId} ${imageSpec.tag}`,
    scenario.includeAttestations ? "with-provenance" : "plain",
    imageSpec.architecture
  );
  images.push({
    ...imageSpec,
    ...image
  });
}

const indexes = [];
for (const indexSpec of scenario.indexes) {
  if (scenario.includeAttestations) {
    _publishMultiArchIndex(
      imageRef,
      indexSpec.tag,
      indexSpec.members.map((member) => images[member.imageIndex].taggedDigest)
    );
  } else {
    await publishSyntheticIndex({
      owner: _resolveOwner(imageRef),
      packageName: _resolvePackageName(imageRef),
      imageRef,
      registryUsername: "",
      token: "",
      tag: indexSpec.tag,
      members: indexSpec.members.map((member) => ({
        digest: images[member.imageIndex].taggedDigest,
        os: "linux",
        architecture: member.architecture
      }))
    });
  }
  indexes.push({
    tag: indexSpec.tag,
    digest: inspectDigest(`${imageRef}:${indexSpec.tag}`)
  });
}

if (scenario.includeCosign) {
  const signTargets = new Set();
  for (const image of images) {
    signTargets.add(image.taggedDigest);
    if (!scenario.includeAttestations) {
      signTargets.add(image.leafDigest);
    }
  }
  for (const index of indexes) {
    signTargets.add(index.digest);
  }
  for (const digest of signTargets) {
    _cosignSign(`${imageRef}@${digest}`);
  }
}

if (scenario.includeAttestations) {
  // Provenance-bearing per-image pushes already created OCI attestation manifests.
}

process.stdout.write(
  JSON.stringify(
    {
      scenarioId,
      imageRef,
      dummyTag: dummyImage.tag,
      imageTags: images.map((entry) => entry.tag),
      indexTags: indexes.map((entry) => entry.tag)
    },
    null,
    2
  ) + "\n"
);

function _resolveScenario(inputScenarioId) {
  const variant = inputScenarioId.replace(/^graph-/, "");
  const [baseCase, ...extensionParts] = variant.split("-");
  const extension = extensionParts.join("-");

  const images =
    baseCase === "1image"
      ? [{ tag: "image-a", architecture: "amd64" }]
      : baseCase === "2images"
        ? [
            { tag: "image-a", architecture: "amd64" },
            { tag: "image-b", architecture: "arm64" }
          ]
        : [
            { tag: "image-a", architecture: "amd64" },
            { tag: "image-b", architecture: "arm64" },
            { tag: "image-c", architecture: "ppc64le" }
          ];

  const indexes =
    baseCase === "1image"
      ? []
      : baseCase === "2images"
        ? [
            {
              tag: "multiarch",
              members: [
                { imageIndex: 0, architecture: "amd64" },
                { imageIndex: 1, architecture: "arm64" }
              ]
            }
          ]
        : [
            {
              tag: "multiarch-a",
              members: [
                { imageIndex: 0, architecture: "amd64" },
                { imageIndex: 1, architecture: "arm64" }
              ]
            },
            {
              tag: "multiarch-b",
              members: [
                { imageIndex: 1, architecture: "arm64" },
                { imageIndex: 2, architecture: "ppc64le" }
              ]
            }
          ];

  return {
    images,
    indexes,
    includeAttestations: extension === "attestations" || extension === "cosign-attestations",
    includeCosign: extension === "cosign" || extension === "cosign-attestations"
  };
}

function _buildImage(imageRefValue, tag, payload, mode, architecture) {
  const contextDirectory = mkdtempSync(join(tmpdir(), "ghcr-graph-matrix-image-"));
  const fixtureDirectory = resolve(process.cwd(), "tools", "tests", "fixtures", "minimal-image");
  cpSync(fixtureDirectory, contextDirectory, { recursive: true });
  writeFileSync(join(contextDirectory, "payload.txt"), `${payload}\n`);
  try {
    if (mode === "with-provenance") {
      execFileSync(
        "docker",
        [
          "buildx",
          "build",
          "--platform",
          `linux/${architecture}`,
          "--provenance=true",
          "--push",
          "--tag",
          `${imageRefValue}:${tag}`,
          contextDirectory
        ],
        { stdio: "inherit" }
      );

      const taggedDigest = inspectDigest(`${imageRefValue}:${tag}`);
      return {
        tag,
        taggedDigest,
        leafDigest: _resolvePlatformDigest(`${imageRefValue}@${taggedDigest}`, "linux", architecture)
      };
    } else {
      execFileSync(
        "docker",
        [
          "buildx",
          "build",
          "--platform",
          `linux/${architecture}`,
          "--provenance=false",
          "--push",
          "--tag",
          `${imageRefValue}:${tag}`,
          contextDirectory
        ],
        { stdio: "inherit" }
      );
    }
  } finally {
    rmSync(contextDirectory, { recursive: true, force: true });
  }

  const digest = inspectDigest(`${imageRefValue}:${tag}`);
  return {
    tag,
    taggedDigest: digest,
    leafDigest: digest
  };
}

function _resolveOwner(imageRefValue) {
  const withoutRegistry = imageRefValue.replace(/^ghcr\.io\//, "");
  return withoutRegistry.split("/")[0];
}

function _resolvePackageName(imageRefValue) {
  const withoutRegistry = imageRefValue.replace(/^ghcr\.io\//, "");
  return withoutRegistry.split("/").slice(1).join("/");
}

function _cosignSign(reference) {
  execFileSync("cosign", ["sign", "--yes", reference], { stdio: "inherit" });
}

function _publishMultiArchIndex(imageRefValue, tag, sourceDigests) {
  execFileSync(
    "docker",
    [
      "buildx",
      "imagetools",
      "create",
      "--tag",
      `${imageRefValue}:${tag}`,
      ...sourceDigests.map((digest) => `${imageRefValue}@${digest}`)
    ],
    { stdio: "inherit" }
  );
}

function _resolvePlatformDigest(reference, os, architecture) {
  const manifest = JSON.parse(
    execFileSync("docker", ["buildx", "imagetools", "inspect", "--raw", reference], { encoding: "utf8" })
  );
  for (const candidate of manifest.manifests ?? []) {
    if (candidate?.platform?.os !== os || candidate?.platform?.architecture !== architecture) {
      continue;
    }

    const digest = candidate.digest;
    if (typeof digest === "string" && digest.startsWith("sha256:")) {
      return digest;
    }
  }

  throw new Error(`failed to resolve platform digest for ${reference} (${os}/${architecture})`);
}
