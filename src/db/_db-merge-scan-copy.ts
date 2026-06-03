import type Database from "better-sqlite3";
import type { SourceScanRow, TargetScanRow } from "./_db-merge-types.js";

export class DbMergeScanCopy {
  readonly #database: Database.Database;

  constructor(database: Database.Database) {
    this.#database = database;
  }

  insertScan(sourceScan: SourceScanRow): number {
    const result = this.#database
      .prepare(
        `
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
          VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        sourceScan.scan_uuid,
        sourceScan.owner,
        sourceScan.package_name,
        sourceScan.package_metadata_json,
        sourceScan.github_actions_run_url,
        sourceScan.scan_started_at,
        sourceScan.scan_completed_at,
        sourceScan.status
      );

    return Number(result.lastInsertRowid);
  }

  copyScanRows(attachName: string, sourceScanId: number, targetScanId: number): void {
    const copySpecs = [
      "package_versions(scan_id, version_id, created_at, updated_at)",
      "package_version_payloads(scan_id, version_id, raw_json)",
      "tags(scan_id, tag, version_id, is_digest_tag)",
      "manifests(scan_id, version_id, digest, media_type, artifact_type, config_media_type, subject_digest, annotations_json, manifest_kind)",
      "manifest_descriptors(scan_id, parent_digest, child_digest, media_type, artifact_type, platform_os, platform_architecture, platform_variant)",
      "manifest_payloads(scan_id, digest, raw_json)",
      "manifest_edges(scan_id, parent_digest, child_digest, edge_kind)",
      "manifest_reachability(scan_id, ancestor_digest, descendant_digest, min_distance)",
      "manifest_graphs(scan_id, digest, graph_id)"
    ] as const;

    for (const spec of copySpecs) {
      const [tableName, columnList] = spec.split("(") as [string, string];
      const trimmedColumnList = columnList.slice(0, -1);
      const columns = trimmedColumnList.split(", ").slice(1);
      this.#database
        .prepare(
          `
            INSERT INTO ${tableName}(${trimmedColumnList})
            SELECT ?, ${columns.join(", ")}
            FROM ${attachName}.${tableName}
            WHERE scan_id = ?
          `
        )
        .run(targetScanId, sourceScanId);
    }
  }

  assertMatchingScanMetadata(sourceScan: SourceScanRow, targetScan: TargetScanRow, sourceDatabasePath: string): void {
    const scanFields: Array<keyof Omit<SourceScanRow, "scan_id">> = [
      "scan_uuid",
      "owner",
      "package_name",
      "package_metadata_json",
      "github_actions_run_url",
      "scan_started_at",
      "scan_completed_at",
      "status"
    ];
    for (const field of scanFields) {
      if (sourceScan[field] !== targetScan[field]) {
        throw new Error(
          `scan metadata mismatch for scan_uuid ${sourceScan.scan_uuid} while merging ${sourceDatabasePath}`
        );
      }
    }
  }

  quoteDatabasePath(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
  }
}
