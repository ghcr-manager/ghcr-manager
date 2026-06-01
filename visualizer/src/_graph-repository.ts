import type Database from "better-sqlite3";
import { placeholders } from "./_sql-placeholders.js";
import type {
  ChangeStatus,
  GraphEdge,
  GraphResponse,
  ManifestDetails,
  ManifestResolution,
  OwnerOption,
  PackageOption,
  ScanOption,
  TagOption
} from "./_types.js";

interface _ManifestRow {
  scan_id: number;
  digest: string;
  version_id: number;
  created_at: string;
  updated_at: string;
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

interface _ScanOrderRow {
  scan_id: number;
  scan_completed_at: string;
}

interface _ResolvedScans {
  scanId: number;
  compareScanId?: number;
  scanIds: number[];
  newerScanId: number;
  olderScanId?: number;
}

export class GraphRepository {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  listOwners(): OwnerOption[] {
    return this.#database
      .prepare(
        `
          SELECT DISTINCT owner
          FROM package_scans
          WHERE status = 'completed'
          ORDER BY owner
        `
      )
      .all() as OwnerOption[];
  }

  listPackages(owner: string): PackageOption[] {
    return this.#database
      .prepare(
        `
          SELECT DISTINCT package_name AS packageName
          FROM package_scans
          WHERE status = 'completed'
            AND owner = ?
          ORDER BY package_name
        `
      )
      .all(owner) as PackageOption[];
  }

  listScans(owner: string, packageName: string): ScanOption[] {
    return this.#database
      .prepare(
        `
          SELECT scan_id AS scanId, scan_completed_at AS scanCompletedAt
          FROM package_scans
          WHERE status = 'completed'
            AND owner = ?
            AND package_name = ?
          ORDER BY scan_completed_at DESC, scan_id DESC
        `
      )
      .all(owner, packageName) as ScanOption[];
  }

  listTags(
    owner: string,
    packageName: string,
    scanId: number | undefined,
    compareScanId: number | undefined,
    query: string,
    limit: number
  ): TagOption[] {
    const resolvedScans = this.#resolveScans(owner, packageName, scanId, compareScanId);
    const normalizedLimit = Math.max(1, Math.min(limit, 50));
    const normalizedQuery = query.trim();
    if (normalizedQuery === "") {
      return [];
    }

    const scanInClause = placeholders(resolvedScans.scanIds.length);

    return this.#database
      .prepare(
        `
          SELECT DISTINCT tag AS tagName
          FROM tags
          WHERE scan_id IN (${scanInClause})
            AND is_digest_tag = 0
            AND tag LIKE ? ESCAPE '\\'
          ORDER BY tag
          LIMIT ?
        `
      )
      .all(...resolvedScans.scanIds, `%${_escapeLikeValue(normalizedQuery)}%`, normalizedLimit) as TagOption[];
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
    compareScanId: number | undefined,
    args: { digest?: string; tag?: string }
  ): ManifestResolution {
    const resolvedScans = this.#resolveScans(owner, packageName, scanId, compareScanId);
    const digest =
      args.digest ??
      this.#resolveDigestByTag(resolvedScans.scanIds, args.tag, resolvedScans.scanId, resolvedScans.compareScanId);
    const node = this.#readManifestMap(
      resolvedScans.scanIds,
      [digest],
      true,
      resolvedScans.newerScanId,
      resolvedScans.olderScanId
    ).get(digest);
    if (!node) {
      throw new Error(`manifest ${digest} was not found in ${owner}/${packageName}`);
    }

    return {
      owner,
      packageName,
      scanId: resolvedScans.scanId,
      compareScanId: resolvedScans.compareScanId,
      digest: node.digest,
      versionId: node.versionId,
      manifestKind: node.manifestKind,
      tags: node.tags.map((tag) => tag.name)
    };
  }

  getManifest(
    owner: string,
    packageName: string,
    scanId: number | undefined,
    compareScanId: number | undefined,
    digest: string
  ): ManifestDetails {
    const resolvedScans = this.#resolveScans(owner, packageName, scanId, compareScanId);
    const node = this.#readManifestMap(
      resolvedScans.scanIds,
      [digest],
      true,
      resolvedScans.newerScanId,
      resolvedScans.olderScanId
    ).get(digest);
    if (!node) {
      throw new Error(`manifest ${digest} was not found in ${owner}/${packageName}`);
    }

    return node;
  }

  getGraph(
    owner: string,
    packageName: string,
    scanId: number | undefined,
    compareScanId: number | undefined,
    centerDigest: string,
    depth: number
  ): GraphResponse {
    const resolvedScans = this.#resolveScans(owner, packageName, scanId, compareScanId);
    const normalizedDepth = Math.max(0, depth);
    const visited = new Set<string>([centerDigest]);
    let frontier = new Set<string>([centerDigest]);

    for (let currentDepth = 0; currentDepth < normalizedDepth && frontier.size > 0; currentDepth += 1) {
      const edgeRows = this.#readAdjacentEdges(resolvedScans.scanIds, [...frontier]);
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

    const nodes = [
      ...this.#readManifestMap(
        resolvedScans.scanIds,
        [...visited],
        false,
        resolvedScans.newerScanId,
        resolvedScans.olderScanId
      ).values()
    ];
    const edges = this.#readVisibleEdges(resolvedScans.scanIds, [...visited]).map((row) => ({
      id: `${row.parent_digest}|${row.child_digest}|${row.edge_kind}`,
      from: row.parent_digest,
      to: row.child_digest,
      kind: row.edge_kind
    }));
    if (!nodes.some((node) => node.digest === centerDigest)) {
      throw new Error(`manifest ${centerDigest} was not found in ${owner}/${packageName}`);
    }

    return {
      owner,
      packageName,
      scanId: resolvedScans.scanId,
      compareScanId: resolvedScans.compareScanId,
      centerDigest,
      depth: normalizedDepth,
      nodes,
      edges: edges.sort((left, right) => left.id.localeCompare(right.id))
    };
  }

  #resolveScans(
    owner: string,
    packageName: string,
    scanId: number | undefined,
    compareScanId: number | undefined
  ): _ResolvedScans {
    const resolvedScanId = this.resolveScanId(owner, packageName, scanId);
    if (compareScanId === undefined || compareScanId === resolvedScanId) {
      return {
        scanId: resolvedScanId,
        scanIds: [resolvedScanId],
        newerScanId: resolvedScanId
      };
    }

    const resolvedCompareScanId = this.resolveScanId(owner, packageName, compareScanId);
    const rows = this.#database
      .prepare(
        `
          SELECT scan_id, scan_completed_at
          FROM package_scans
          WHERE owner = ?
            AND package_name = ?
            AND scan_id IN (?, ?)
          ORDER BY scan_completed_at, scan_id
        `
      )
      .all(owner, packageName, resolvedScanId, resolvedCompareScanId) as _ScanOrderRow[];
    if (rows.length !== 2) {
      throw new Error(`failed to resolve compare scans for ${owner}/${packageName}`);
    }

    return {
      scanId: resolvedScanId,
      compareScanId: resolvedCompareScanId,
      scanIds: [resolvedScanId, resolvedCompareScanId],
      newerScanId: rows[1].scan_id,
      olderScanId: rows[0].scan_id
    };
  }

  #resolveDigestByTag(
    scanIds: number[],
    tag: string | undefined,
    preferredScanId: number,
    fallbackScanId: number | undefined
  ): string {
    if (!tag) {
      throw new Error("either digest or tag is required");
    }

    const scanInClause = placeholders(scanIds.length);

    const row = this.#database
      .prepare(
        `
          SELECT manifest.digest
          FROM tags
          JOIN manifests manifest
            ON manifest.scan_id = tags.scan_id
           AND manifest.version_id = tags.version_id
          WHERE tags.scan_id IN (${scanInClause})
            AND tags.tag = ?
          ORDER BY
            CASE
              WHEN tags.scan_id = ? THEN 0
              WHEN ? IS NOT NULL AND tags.scan_id = ? THEN 1
              ELSE 2
            END
          LIMIT 1
        `
      )
      .get(...scanIds, tag, preferredScanId, fallbackScanId ?? null, fallbackScanId ?? -1) as
      | { digest: string }
      | undefined;
    if (!row) {
      throw new Error(`tag ${tag} was not found in selected scan context`);
    }

    return row.digest;
  }

  #readAdjacentEdges(scanIds: number[], digests: string[]): _EdgeRow[] {
    const scanInClause = placeholders(scanIds.length);
    const inClause = placeholders(digests.length);
    const sql = `
      SELECT DISTINCT parent_digest, child_digest, edge_kind
      FROM manifest_edges
      WHERE scan_id IN (${scanInClause})
        AND (parent_digest IN (${inClause}) OR child_digest IN (${inClause}))
      ORDER BY parent_digest, child_digest, edge_kind
    `;

    return this.#database.prepare(sql).all(...scanIds, ...digests, ...digests) as _EdgeRow[];
  }

  #readVisibleEdges(scanIds: number[], digests: string[]): _EdgeRow[] {
    const scanInClause = placeholders(scanIds.length);
    const inClause = placeholders(digests.length);
    const sql = `
      SELECT DISTINCT parent_digest, child_digest, edge_kind
      FROM manifest_edges
      WHERE scan_id IN (${scanInClause})
        AND parent_digest IN (${inClause})
        AND child_digest IN (${inClause})
      ORDER BY parent_digest, child_digest, edge_kind
    `;

    return this.#database.prepare(sql).all(...scanIds, ...digests, ...digests) as _EdgeRow[];
  }

  #readManifestMap(
    scanIds: number[],
    digests: string[],
    includePayload: boolean,
    newerScanId: number,
    olderScanId: number | undefined
  ): Map<string, ManifestDetails> {
    const scanInClause = placeholders(scanIds.length);
    const inClause = placeholders(digests.length);
    const payloadColumn = includePayload ? "payload.raw_json" : "NULL";
    const sql = `
      WITH ranked_platforms AS (
        SELECT
          scan_id,
          child_digest,
          platform_os,
          platform_architecture,
          platform_variant,
          ROW_NUMBER() OVER (
            PARTITION BY scan_id, child_digest
            ORDER BY parent_digest
          ) AS row_number
        FROM manifest_descriptors
        WHERE scan_id IN (${scanInClause})
          AND child_digest IN (${inClause})
          AND (
            platform_os IS NOT NULL
            OR platform_architecture IS NOT NULL
            OR platform_variant IS NOT NULL
          )
      )
      SELECT
        manifest.scan_id,
        manifest.digest,
        manifest.version_id,
        package_version.created_at,
        package_version.updated_at,
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
      JOIN package_versions package_version
        ON package_version.scan_id = manifest.scan_id
       AND package_version.version_id = manifest.version_id
      LEFT JOIN manifest_payloads payload
        ON payload.scan_id = manifest.scan_id
       AND payload.digest = manifest.digest
      LEFT JOIN tags tag
        ON tag.scan_id = manifest.scan_id
       AND tag.version_id = manifest.version_id
       AND tag.is_digest_tag = 0
      LEFT JOIN ranked_platforms platform
        ON platform.scan_id = manifest.scan_id
       AND platform.child_digest = manifest.digest
       AND platform.row_number = 1
      WHERE manifest.scan_id IN (${scanInClause})
        AND manifest.digest IN (${inClause})
      ORDER BY manifest.digest, CASE WHEN manifest.scan_id = ? THEN 0 ELSE 1 END, tag.tag
    `;
    const rows = this.#database
      .prepare(sql)
      .all(...scanIds, ...digests, ...scanIds, ...digests, newerScanId) as _ManifestRow[];
    const manifests = new Map<string, ManifestDetails>();
    const scanMemberships = new Map<string, Set<number>>();
    const tagsByDigest = new Map<string, Map<string, Set<number>>>();

    for (const row of rows) {
      let scanMembership = scanMemberships.get(row.digest);
      if (!scanMembership) {
        scanMembership = new Set<number>();
        scanMemberships.set(row.digest, scanMembership);
      }
      scanMembership.add(row.scan_id);

      let manifest = manifests.get(row.digest);
      if (!manifest || row.scan_id === newerScanId) {
        manifest = {
          id: row.digest,
          digest: row.digest,
          versionId: row.version_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          manifestKind: row.manifest_kind,
          mediaType: row.media_type,
          displayPlatform: _formatPlatform(row.platform_os, row.platform_architecture, row.platform_variant),
          artifactType: row.artifact_type,
          subjectDigest: row.subject_digest,
          tags: [],
          changeStatus: "unchanged",
          rawJson: row.raw_json
        };
        manifests.set(row.digest, manifest);
      }

      if (row.tag) {
        let tags = tagsByDigest.get(row.digest);
        if (!tags) {
          tags = new Map<string, Set<number>>();
          tagsByDigest.set(row.digest, tags);
        }

        let tagScans = tags.get(row.tag);
        if (!tagScans) {
          tagScans = new Set<number>();
          tags.set(row.tag, tagScans);
        }

        tagScans.add(row.scan_id);
      }
    }

    for (const [digest, manifest] of manifests) {
      const tagMap = tagsByDigest.get(digest) ?? new Map<string, Set<number>>();
      manifest.changeStatus = _resolveChangeStatus(
        scanMemberships.get(digest) ?? new Set<number>(),
        newerScanId,
        olderScanId
      );
      manifest.tags = [...tagMap.entries()]
        .map(([name, tagScans]) => ({
          name,
          changeStatus: _resolveChangeStatus(tagScans, newerScanId, olderScanId)
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    }

    return manifests;
  }
}

function _resolveChangeStatus(
  scanIds: ReadonlySet<number>,
  newerScanId: number,
  olderScanId: number | undefined
): ChangeStatus {
  if (olderScanId === undefined) {
    return "unchanged";
  }

  const hasNewer = scanIds.has(newerScanId);
  const hasOlder = scanIds.has(olderScanId);
  if (hasNewer && hasOlder) {
    return "unchanged";
  }

  return hasNewer ? "added" : "removed";
}

function _formatPlatform(os: string | null, architecture: string | null, variant: string | null): string | null {
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

function _escapeLikeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
