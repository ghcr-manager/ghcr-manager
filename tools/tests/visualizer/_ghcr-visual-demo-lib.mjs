#!/usr/bin/env node
/* global Buffer, fetch, process, URL */

import { mkdtempSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const _registryBaseUrl = "https://ghcr.io";
const _githubApiBaseUrl = "https://api.github.com";

export function parseArgs(helpText) {
  const [owner, packageName, registryUsername, token] = process.argv.slice(2);
  if (owner === "--help" || owner === "-h") {
    process.stdout.write(`${helpText}\n`);
    process.exit(0);
  }

  if (!owner || !packageName || !registryUsername || !token) {
    process.stderr.write(`${helpText}\n`);
    process.exit(1);
  }

  return {
    owner,
    packageName,
    imageRef: `ghcr.io/${owner}/${packageName}`,
    registryUsername,
    token
  };
}

export async function deletePackageIfPresent(owner, packageName, token) {
  const ownerPathSegment = await loadOwnerPathSegment(owner, token);
  const url = new URL(
    `/${ownerPathSegment}/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}`,
    _githubApiBaseUrl
  ).toString();
  const response = await fetch(url, {
    method: "DELETE",
    headers: buildGitHubHeaders(token)
  });

  if (response.status === 404) {
    process.stdout.write(`Package ${owner}/${packageName} did not exist; continuing.\n`);
    return;
  }

  if (!response.ok) {
    throw new Error(
      `failed to delete package ${owner}/${packageName}: status ${response.status} - ${await loadMessage(response)}`
    );
  }

  process.stdout.write(`Deleted package ${owner}/${packageName}.\n`);
}

export async function deletePackageVersion(owner, packageName, token, versionId) {
  const ownerPathSegment = await loadOwnerPathSegment(owner, token);
  const url = new URL(
    `/${ownerPathSegment}/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}/versions/${versionId}`,
    _githubApiBaseUrl
  ).toString();
  const response = await fetch(url, {
    method: "DELETE",
    headers: buildGitHubHeaders(token)
  });
  if (!response.ok) {
    throw new Error(
      `failed to delete package version ${versionId}: status ${response.status} - ${await loadMessage(response)}`
    );
  }
}

export async function findPackageVersionByTag(owner, packageName, token, tag) {
  const ownerPathSegment = await loadOwnerPathSegment(owner, token);
  let page = 1;
  while (true) {
    const url = new URL(
      `/${ownerPathSegment}/${encodeURIComponent(owner)}/packages/container/${encodeURIComponent(packageName)}/versions`,
      _githubApiBaseUrl
    );
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      headers: buildGitHubHeaders(token)
    });
    if (!response.ok) {
      throw new Error(
        `failed to list package versions for ${owner}/${packageName}: status ${response.status} - ${await loadMessage(response)}`
      );
    }

    const versions = await response.json();
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new Error(`failed to find tag '${tag}' in package ${owner}/${packageName}`);
    }

    for (const version of versions) {
      const tags = version?.metadata?.container?.tags;
      if (Array.isArray(tags) && tags.includes(tag)) {
        return {
          versionId: version.id,
          digest: version.name
        };
      }
    }

    if (versions.length < 100) {
      break;
    }

    page += 1;
  }

  throw new Error(`failed to find tag '${tag}' in package ${owner}/${packageName}`);
}

export function buildAndPushImage(imageRef, tag, payloadLabel) {
  const contextDirectory = createImageContext(payloadLabel);
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
        `${imageRef}:${tag}`,
        contextDirectory
      ],
      { stdio: "inherit" }
    );
  } finally {
    rmSync(contextDirectory, { recursive: true, force: true });
  }

  return inspectDigest(`${imageRef}:${tag}`);
}

export async function publishSyntheticIndex(options) {
  const token = await loadRegistryPushToken(
    options.owner,
    options.packageName,
    options.registryUsername,
    options.token
  );
  const indexJson = {
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: options.members.map((member) => ({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      digest: member.digest,
      size: 702,
      platform: {
        architecture: member.architecture,
        os: member.os
      }
    }))
  };
  const response = await fetch(
    `${_registryBaseUrl}/v2/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.packageName)}/manifests/${encodeURIComponent(options.tag)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/vnd.oci.image.index.v1+json"
      },
      body: JSON.stringify(indexJson)
    }
  );
  if (!response.ok) {
    throw new Error(
      `failed to publish synthetic index '${options.tag}': status ${response.status} - ${await loadMessage(response)}`
    );
  }
}

export function inspectDigest(reference) {
  const output = execFileSync("docker", ["buildx", "imagetools", "inspect", reference], {
    encoding: "utf8"
  });
  const digestLine = output.split("\n").find((line) => line.trim().startsWith("Digest:"));
  const digest = digestLine?.split(/\s+/)[1];
  if (!digest || !digest.startsWith("sha256:")) {
    throw new Error(`failed to inspect digest for ${reference}`);
  }

  return digest;
}

export function copyTag(imageRef, sourceTag, targetTag) {
  execFileSync(
    "docker",
    ["buildx", "imagetools", "create", "--tag", `${imageRef}:${targetTag}`, `${imageRef}:${sourceTag}`],
    { stdio: "inherit" }
  );
}

export function runGhcrManagerCleanup(options) {
  const workDirectory = mkdtempSync(join(tmpdir(), "ghcr-visual-demo-cleanup-"));
  const databasePath = join(workDirectory, "cleanup.sqlite");
  const cliPath = resolve(process.cwd(), "src", "cli", "index.ts");
  try {
    execFileSync(
      "node",
      [
        "--import",
        "tsx",
        cliPath,
        "cleanup",
        "--db",
        databasePath,
        "--owner",
        options.owner,
        "--package",
        options.packageName,
        "--token",
        options.token,
        "--delete-tag",
        options.deleteTag
      ],
      { stdio: "inherit" }
    );
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

function createImageContext(payloadLabel) {
  const contextDirectory = mkdtempSync(join(tmpdir(), "ghcr-visual-demo-image-"));
  const fixtureDirectory = resolve(process.cwd(), "tools", "tests", "fixtures", "minimal-image");
  cpSync(fixtureDirectory, contextDirectory, { recursive: true });
  writeFileSync(join(contextDirectory, "payload.txt"), `${payloadLabel}\n`);
  return contextDirectory;
}

async function loadOwnerPathSegment(owner, token) {
  const url = new URL(`/users/${encodeURIComponent(owner)}`, _githubApiBaseUrl).toString();
  const response = await fetch(url, {
    headers: buildGitHubHeaders(token)
  });
  if (!response.ok) {
    throw new Error(`failed to load owner ${owner}: status ${response.status} - ${await loadMessage(response)}`);
  }

  const payload = await response.json();
  if (payload?.type === "Organization") {
    return "orgs";
  }
  if (payload?.type === "User") {
    return "users";
  }

  throw new Error(`unsupported owner type for ${owner}: ${payload?.type ?? "unknown"}`);
}

async function loadRegistryPushToken(owner, packageName, registryUsername, token) {
  const scope = `repository:${owner}/${packageName}:pull,push`;
  const url = new URL("/token", _registryBaseUrl);
  url.searchParams.set("service", "ghcr.io");
  url.searchParams.set("scope", scope);
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${registryUsername}:${token}`).toString("base64")}`
    }
  });
  if (!response.ok) {
    throw new Error(
      `failed to load registry push token for ${owner}/${packageName}: status ${response.status} - ${await loadMessage(response)}`
    );
  }

  const payload = await response.json();
  if (typeof payload?.token !== "string" || payload.token.length === 0) {
    throw new Error(`registry push token response for ${owner}/${packageName} did not contain a token`);
  }

  return payload.token;
}

function buildGitHubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "ghcr-manager",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function loadMessage(response) {
  try {
    const payload = await response.json();
    return typeof payload?.message === "string" ? payload.message : "unknown error";
  } catch {
    return "unknown error";
  }
}
