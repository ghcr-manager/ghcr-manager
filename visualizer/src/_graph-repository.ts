import type Database from "better-sqlite3";
import { placeholders } from "./_sql-placeholders.js";
import type { GraphEdge, GraphResponse, ManifestDetails, ManifestResolution } from "./_types.js";

interface _ManifestRow {
  digest: string;
  version_id: number;
  manifest_kind: string | null;
  media_type: string;
  platform_os: string | null;
  platform_architecture: string | null;
  platform_variant: string | null;
  artifact_type: string | null;
  subject_digest: string | null;
  raw_json: string | null;
  tag: string | null;
}

interface _EdgeRow {
  parent_digest: string;
  child_digest: string;
  edge_kind: GraphEdge["kind"];
}

export class GraphRepository {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  resolveLatestScanId(owner: string, packageName: string): number {
    const row = this.#database
      .prepare(
        `
          SELECT scan_id
          FROM v_latest_scan_per_package
          WHERE owner = ?
            AND package_name = ?
          LIMIT 1
        `
      )
      .get(owner, packageName) as { scan_id: number } | undefined;
    if (!row) {
      throw new Error(`database does not contain completed package scan for ${owner}/${packageName}`);
    }

    return row.scan_id;
  }

  resolveScanId(owner: string, packageName: string, scanId: number | undefined): number {
    if (scanId === undefined) {
      return this.resolveLatestScanId(owner, packageName);
    }

    const row = this.#database
      .prepare(
        `
          SELECT scan_id
          FROM package_scans
          WHERE scan_id = ?
            AND owner = ?
            AND package_name = ?
            AND status = 'completed'
          LIMIT 1
        `
      )
      .get(scanId, owner, packageName) as { scan_id: number } | undefined;
    if (!row) {
      throw new Error(`scan ${scanId} is not a completed scan for ${owner}/${packageName}`);
    }

    return row.scan_id;
  }

  resolveManifest(
    owner: string,
    packageName: string,
    scanId: number | undefined,
    args: { digest?: string; tag?: string }
  ): ManifestResolution {
    const resolvedScanId = this.resolveScanId(owner, packageName, scanId);
    const digest = args.digest ?? this.#resolveDigestByTag(resolvedScanId, args.tag);
    const node = this.#readManifestMap(resolvedScanId, [digest], true).get(digest);
    if (!node) {
      throw new Error(`manifest ${digest} was not found in ${owner}/${packageName} scan ${resolvedScanId}`);
    }

    return {
      owner,
      packageName,
      scanId: resolvedScanId,
      digest: node.digest,
      versionId: node.versionId,
      manifestKind: node.manifestKind,
      tags: node.tags
    };
  }

  getManifest(owner: string, packageName: string, scanId: number | undefined, digest: string): ManifestDetails {
    const resolvedScanId = this.resolveScanId(owner, packageName, scanId);
    const node = this.#readManifestMap(resolvedScanId, [digest], true).get(digest);
    if (!node) {
      throw new Error(`manifest ${digest} was not found in ${owner}/${packageName} scan ${resolvedScanId}`);
    }

    return node;
  }

  getGraph(
    owner: string,
    packageName: string,
    scanId: number | undefined,
    centerDigest: string,
    depth: number
  ): GraphResponse {
    const resolvedScanId = this.resolveScanId(owner, packageName, scanId);
    const normalizedDepth = Math.max(0, depth);
    const visited = new Set<string>([centerDigest]);
    let frontier = new Set<string>([centerDigest]);

    for (let currentDepth = 0; currentDepth < normalizedDepth && frontier.size > 0; currentDepth += 1) {
      const edgeRows = this.#readAdjacentEdges(resolvedScanId, [...frontier]);
      const nextFrontier = new Set<string>();

      for (const row of edgeRows) {
        if (!visited.has(row.parent_digest)) {
          visited.add(row.parent_digest);
          nextFrontier.add(row.parent_digest);
        }
        if (!visited.has(row.child_digest)) {
          visited.add(row.child_digest);
          nextFrontier.add(row.child_digest);
        }
      }

      frontier = nextFrontier;
    }

    const nodes = [...this.#readManifestMap(resolvedScanId, [...visited], false).values()];
    const edges = this.#readVisibleEdges(resolvedScanId, [...visited]).map((row) => ({
      id: `${row.parent_digest}|${row.child_digest}|${row.edge_kind}`,
      from: row.parent_digest,
      to: row.child_digest,
      kind: row.edge_kind
    }));
    if (!nodes.some((node) => node.digest === centerDigest)) {
      throw new Error(`manifest ${centerDigest} was not found in ${owner}/${packageName} scan ${resolvedScanId}`);
    }

    return {
      owner,
      packageName,
      scanId: resolvedScanId,
      centerDigest,
      depth: normalizedDepth,
      nodes,
      edges: edges.sort((left, right) => left.id.localeCompare(right.id))
    };
  }

  #resolveDigestByTag(scanId: number, tag: string | undefined): string {
    if (!tag) {
      throw new Error("either digest or tag is required");
    }

    const row = this.#database
      .prepare(
        `
          SELECT manifest.digest
          FROM tags
          JOIN manifests manifest
            ON manifest.scan_id = tags.scan_id
           AND manifest.version_id = tags.version_id
          WHERE tags.scan_id = ?
            AND tags.tag = ?
          LIMIT 1
        `
      )
      .get(scanId, tag) as { digest: string } | undefined;
    if (!row) {
      throw new Error(`tag ${tag} was not found in scan ${scanId}`);
    }

    return row.digest;
  }

  #readAdjacentEdges(scanId: number, digests: string[]): _EdgeRow[] {
    const inClause = placeholders(digests.length);
    const sql = `
      SELECT parent_digest, child_digest, edge_kind
      FROM manifest_edges
      WHERE scan_id = ?
        AND (parent_digest IN (${inClause}) OR child_digest IN (${inClause}))
      ORDER BY parent_digest, child_digest, edge_kind
    `;

    return this.#database.prepare(sql).all(scanId, ...digests, ...digests) as _EdgeRow[];
  }

  #readVisibleEdges(scanId: number, digests: string[]): _EdgeRow[] {
    const inClause = placeholders(digests.length);
    const sql = `
      SELECT parent_digest, child_digest, edge_kind
      FROM manifest_edges
      WHERE scan_id = ?
        AND parent_digest IN (${inClause})
        AND child_digest IN (${inClause})
      ORDER BY parent_digest, child_digest, edge_kind
    `;

    return this.#database.prepare(sql).all(scanId, ...digests, ...digests) as _EdgeRow[];
  }

  #readManifestMap(scanId: number, digests: string[], includePayload: boolean): Map<string, ManifestDetails> {
    const inClause = placeholders(digests.length);
    const payloadColumn = includePayload ? "payload.raw_json" : "NULL";
    const sql = `
      WITH ranked_platforms AS (
        SELECT
          child_digest,
          platform_os,
          platform_architecture,
          platform_variant,
          ROW_NUMBER() OVER (
            PARTITION BY child_digest
            ORDER BY parent_digest
          ) AS row_number
        FROM manifest_descriptors
        WHERE scan_id = ?
          AND child_digest IN (${inClause})
          AND (
            platform_os IS NOT NULL
            OR platform_architecture IS NOT NULL
            OR platform_variant IS NOT NULL
          )
      )
      SELECT
        manifest.digest,
        manifest.version_id,
        manifest.manifest_kind,
        manifest.media_type,
        platform.platform_os,
        platform.platform_architecture,
        platform.platform_variant,
        manifest.artifact_type,
        manifest.subject_digest,
        ${payloadColumn} AS raw_json,
        tag.tag
      FROM manifests manifest
      LEFT JOIN manifest_payloads payload
        ON payload.scan_id = manifest.scan_id
       AND payload.digest = manifest.digest
      LEFT JOIN tags tag
        ON tag.scan_id = manifest.scan_id
       AND tag.version_id = manifest.version_id
       AND tag.is_digest_tag = 0
      LEFT JOIN ranked_platforms platform
        ON platform.child_digest = manifest.digest
       AND platform.row_number = 1
      WHERE manifest.scan_id = ?
        AND manifest.digest IN (${inClause})
      ORDER BY manifest.digest, tag.tag
    `;
    const rows = this.#database.prepare(sql).all(scanId, ...digests, scanId, ...digests) as _ManifestRow[];
    const manifests = new Map<string, ManifestDetails>();

    for (const row of rows) {
      let manifest = manifests.get(row.digest);
      if (!manifest) {
        manifest = {
          id: row.digest,
          digest: row.digest,
          versionId: row.version_id,
          manifestKind: row.manifest_kind,
          mediaType: row.media_type,
          displayPlatform: _formatPlatform(row.platform_os, row.platform_architecture, row.platform_variant),
          artifactType: row.artifact_type,
          subjectDigest: row.subject_digest,
          tags: [],
          rawJson: row.raw_json
        };
        manifests.set(row.digest, manifest);
      }

      if (row.tag && !manifest.tags.includes(row.tag)) {
        manifest.tags.push(row.tag);
      }
    }

    return manifests;
  }
}

function _formatPlatform(
  os: string | null,
  architecture: string | null,
  variant: string | null
): string | null {
  const normalizedOs = _normalizePlatformPart(os);
  const normalizedArchitecture = _normalizePlatformPart(architecture);
  const normalizedVariant = _normalizePlatformPart(variant);
  if (!normalizedOs && !normalizedArchitecture && !normalizedVariant) {
    return null;
  }

  const platform = [normalizedOs, normalizedArchitecture].filter((value) => value).join("/");
  if (normalizedVariant) {
    return platform ? `${platform}/${normalizedVariant}` : normalizedVariant;
  }

  return platform || null;
}

function _normalizePlatformPart(value: string | null): string | null {
  if (!value || value === "unknown") {
    return null;
  }

  return value;
}
