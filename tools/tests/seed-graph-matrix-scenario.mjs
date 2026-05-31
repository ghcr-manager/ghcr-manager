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
const imageDigests = [];
for (const imageSpec of scenario.images) {
  const digest = _buildImage(imageRef, imageSpec.tag, `${scenarioId} ${imageSpec.tag}`);
  imageDigests.push({
    ...imageSpec,
    digest
  });
}

const indexDigests = [];
for (const indexSpec of scenario.indexes) {
  await publishSyntheticIndex({
    owner: _resolveOwner(imageRef),
    packageName: _resolvePackageName(imageRef),
    imageRef,
    registryUsername: "",
    token: "",
    tag: indexSpec.tag,
    members: indexSpec.members.map((member) => ({
      digest: imageDigests[member.imageIndex].digest,
      os: "linux",
      architecture: member.architecture
    }))
  });
  indexDigests.push({
    tag: indexSpec.tag,
    digest: inspectDigest(`${imageRef}:${indexSpec.tag}`)
  });
}

if (scenario.includeCosign) {
  for (const imageSpec of imageDigests) {
    _cosignSign(`${imageRef}@${imageSpec.digest}`);
  }
  for (const indexSpec of indexDigests) {
    _cosignSign(`${imageRef}@${indexSpec.digest}`);
  }
}

if (scenario.includeAttestations) {
  const predicatePath = _writePredicateFile(scenarioId);
  try {
    for (const imageSpec of imageDigests) {
      _cosignAttest(`${imageRef}@${imageSpec.digest}`, predicatePath);
    }
    for (const indexSpec of indexDigests) {
      _cosignAttest(`${imageRef}@${indexSpec.digest}`, predicatePath);
    }
  } finally {
    rmSync(predicatePath, { force: true });
  }
}

process.stdout.write(
  JSON.stringify(
    {
      scenarioId,
      imageRef,
      imageTags: imageDigests.map((entry) => entry.tag),
      indexTags: indexDigests.map((entry) => entry.tag)
    },
    null,
    2
  ) + "\n"
);

function _resolveScenario(inputScenarioId) {
  const variant = inputScenarioId.replace(/^graph-/, "");
  const [baseCase, extension] = variant.split("-");

  const images =
    baseCase === "1image"
      ? [{ tag: `${inputScenarioId}--image-a` }]
      : baseCase === "2images"
        ? [{ tag: `${inputScenarioId}--image-a` }, { tag: `${inputScenarioId}--image-b` }]
        : [
            { tag: `${inputScenarioId}--image-a` },
            { tag: `${inputScenarioId}--image-b` },
            { tag: `${inputScenarioId}--image-c` }
          ];

  const indexes =
    baseCase === "1image"
      ? []
      : baseCase === "2images"
        ? [
            {
              tag: `${inputScenarioId}--root`,
              members: [
                { imageIndex: 0, architecture: "amd64" },
                { imageIndex: 1, architecture: "arm64" }
              ]
            }
          ]
        : [
            {
              tag: `${inputScenarioId}--root-a`,
              members: [
                { imageIndex: 0, architecture: "amd64" },
                { imageIndex: 1, architecture: "arm64" }
              ]
            },
            {
              tag: `${inputScenarioId}--root-b`,
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

function _buildImage(imageRefValue, tag, payload) {
  const contextDirectory = mkdtempSync(join(tmpdir(), "ghcr-graph-matrix-image-"));
  const fixtureDirectory = resolve(process.cwd(), "tools", "tests", "fixtures", "minimal-image");
  cpSync(fixtureDirectory, contextDirectory, { recursive: true });
  writeFileSync(join(contextDirectory, "payload.txt"), `${payload}\n`);
  try {
    execFileSync(
      "docker",
      [
        "buildx",
        "build",
        "--platform",
        "linux/amd64",
        "--provenance=false",
        "--push",
        "--tag",
        `${imageRefValue}:${tag}`,
        contextDirectory
      ],
      { stdio: "inherit" }
    );
  } finally {
    rmSync(contextDirectory, { recursive: true, force: true });
  }

  return inspectDigest(`${imageRefValue}:${tag}`);
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

function _cosignAttest(reference, predicatePath) {
  execFileSync(
    "cosign",
    ["attest", "--yes", "--predicate", predicatePath, "--type", "https://slsa.dev/provenance/v1", reference],
    { stdio: "inherit" }
  );
}

function _writePredicateFile(scenarioIdValue) {
  const filePath = join(tmpdir(), `ghcr-manager-${scenarioIdValue}-predicate.json`);
  writeFileSync(
    filePath,
    JSON.stringify({
      buildDefinition: {
        externalParameters: {
          scenario: scenarioIdValue
        }
      }
    })
  );
  return filePath;
}
