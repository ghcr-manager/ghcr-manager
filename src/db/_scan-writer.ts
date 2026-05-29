import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { isDigestTag } from "../core/index.js";
import type {
  ManifestDescriptorRecord,
  ManifestEdgeRecord,
  ManifestRecord,
  PackageVersionRecord,
  TagRecord
} from "../core/index.js";
import { resolveGitHubActionsRunUrl } from "./_github-actions-run-url.js";
import { rebuildManifestReachability } from "./_manifest-reachability.js";

export class ScanWriter {
  readonly #database: Database.Database;
  readonly #startScanStatement: Database.Statement;
  readonly #markScanCompletedStatement: Database.Statement;
  readonly #markScanFailedStatement: Database.Statement;
  readonly #insertPackageVersionStatement: Database.Statement;
  readonly #insertPackageVersionPayloadStatement: Database.Statement;
  readonly #insertTagStatement: Database.Statement;
  readonly #insertManifestStatement: Database.Statement;
  readonly #insertManifestPayloadStatement: Database.Statement;
  readonly #insertManifestDescriptorStatement: Database.Statement;
  readonly #insertManifestEdgeStatement: Database.Statement;
  #activeScanId: number | null = null;

  constructor(database: Database.Database) {
    this.#database = database;
    this.#startScanStatement = this.#database.prepare(`
      INSERT INTO package_scans(
        scan_uuid,
        owner,
        package_name,
        package_metadata_json,
        github_actions_run_url,
        scan_started_at,
        scan_completed_at,
        status
      )
      VALUES(?, ?, ?, ?, ?, ?, NULL, 'running')
    `);
    this.#markScanCompletedStatement = this.#database.prepare(`
      UPDATE package_scans
      SET scan_completed_at = ?, status = 'completed'
      WHERE scan_id = ?
    `);
    this.#markScanFailedStatement = this.#database.prepare(`
      UPDATE package_scans
      SET scan_completed_at = ?, status = 'failed'
      WHERE scan_id = ?
    `);
    this.#insertPackageVersionStatement = this.#database.prepare(`
      INSERT OR REPLACE INTO package_versions(scan_id, version_id, created_at, updated_at)
      VALUES(@scanId, @versionId, @createdAt, @updatedAt)
    `);
    this.#insertPackageVersionPayloadStatement = this.#database.prepare(`
      INSERT OR REPLACE INTO package_version_payloads(scan_id, version_id, raw_json)
      VALUES(?, ?, ?)
    `);
    this.#insertTagStatement = this.#database.prepare(`
      INSERT OR REPLACE INTO tags(scan_id, tag, version_id, is_digest_tag)
      VALUES(@scanId, @tag, @versionId, @isDigestTag)
    `);
    this.#insertManifestStatement = this.#database.prepare(`
      INSERT OR REPLACE INTO manifests(
        scan_id,
        version_id,
        digest,
        media_type,
        artifact_type,
        config_media_type,
        subject_digest,
        annotations_json,
        manifest_kind
      )
      VALUES(
        @scanId,
        @versionId,
        @digest,
        @mediaType,
        @artifactType,
        @configMediaType,
        @subjectDigest,
        @annotationsJson,
        @manifestKind
      )
    `);
    this.#insertManifestPayloadStatement = this.#database.prepare(`
      INSERT OR REPLACE INTO manifest_payloads(scan_id, digest, raw_json)
      VALUES(?, ?, ?)
    `);
    this.#insertManifestDescriptorStatement = this.#database.prepare(`
      INSERT OR REPLACE INTO manifest_descriptors(
        scan_id,
        parent_digest,
        child_digest,
        media_type,
        artifact_type,
        platform_os,
        platform_architecture,
        platform_variant
      )
      VALUES(
        @scanId,
        @parentDigest,
        @childDigest,
        @mediaType,
        @artifactType,
        @platformOs,
        @platformArchitecture,
        @platformVariant
      )
    `);
    this.#insertManifestEdgeStatement = this.#database.prepare(`
      INSERT OR IGNORE INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind)
      VALUES(@scanId, @parentDigest, @childDigest, @edgeKind)
    `);
  }

  startScan(owner: string, packageName: string, scanStartedAt: string, packageMetadata: { rawJson: string }): void {
    const result = this.#startScanStatement.run(
      randomUUID(),
      owner,
      packageName,
      packageMetadata.rawJson,
      resolveGitHubActionsRunUrl(),
      scanStartedAt
    );

    this.#activeScanId = Number(result.lastInsertRowid);
  }

  markScanCompleted(scanCompletedAt: string): void {
    this.#markScanCompletedStatement.run(scanCompletedAt, this.#requireScanId());
  }

  markScanFailed(scanCompletedAt: string): void {
    this.#markScanFailedStatement.run(scanCompletedAt, this.#requireScanId());
  }

  insertPackageVersion(version: PackageVersionRecord): void {
    this.#insertPackageVersionStatement.run({
      scanId: this.#requireScanId(),
      versionId: version.versionId,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt
    });
  }

  insertPackageVersionPayload(versionId: number, rawJson: string): void {
    this.#insertPackageVersionPayloadStatement.run(this.#requireScanId(), versionId, rawJson);
  }

  insertTag(tag: TagRecord): void {
    this.#insertTagStatement.run({
      scanId: this.#requireScanId(),
      ...tag,
      isDigestTag: isDigestTag(tag.tag) ? 1 : 0
    });
  }

  insertManifest(manifest: ManifestRecord): void {
    this.#insertManifestStatement.run({
      scanId: this.#requireScanId(),
      versionId: manifest.versionId,
      digest: manifest.digest,
      mediaType: manifest.mediaType,
      artifactType: manifest.artifactType ?? null,
      configMediaType: manifest.configMediaType ?? null,
      subjectDigest: manifest.subjectDigest ?? null,
      annotationsJson: manifest.annotations ? JSON.stringify(manifest.annotations) : null,
      manifestKind: manifest.manifestKind ?? null
    });
  }

  insertManifestPayload(digest: string, rawJson: string): void {
    this.#insertManifestPayloadStatement.run(this.#requireScanId(), digest, rawJson);
  }

  insertManifestDescriptor(descriptor: ManifestDescriptorRecord): void {
    this.#insertManifestDescriptorStatement.run({
      scanId: this.#requireScanId(),
      parentDigest: descriptor.parentDigest,
      childDigest: descriptor.childDigest,
      mediaType: descriptor.mediaType,
      artifactType: descriptor.artifactType ?? null,
      platformOs: descriptor.platform?.os ?? null,
      platformArchitecture: descriptor.platform?.architecture ?? null,
      platformVariant: descriptor.platform?.variant ?? null
    });
  }

  insertManifestEdge(edge: ManifestEdgeRecord): void {
    this.#insertManifestEdgeStatement.run({
      scanId: this.#requireScanId(),
      ...edge
    });
  }

  rebuildManifestReachability(): void {
    rebuildManifestReachability(this.#database, this.#requireScanId());
  }

  getActiveScanId(): number {
    return this.#requireScanId();
  }

  #requireScanId(): number {
    if (this.#activeScanId === null) {
      throw new Error(
        "package not initialized; call startScan(owner, packageName, scanStartedAt, packageMetadata) first"
      );
    }

    return this.#activeScanId;
  }
}
