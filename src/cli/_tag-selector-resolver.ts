import type Database from "better-sqlite3";
import type { PlanCommandInputs } from "./_planner-options.js";

const BrokenIndexModes = {
  allMissing: "all-missing",
  someMissing: "some-missing"
} as const;

type BrokenIndexMode = (typeof BrokenIndexModes)[keyof typeof BrokenIndexModes];

export function resolveTagSelectors(database: Database.Database, inputs: PlanCommandInputs): PlanCommandInputs {
  if (!inputs.deleteGhostImages && !inputs.deletePartialImages && !inputs.deleteOrphanedImages) {
    return inputs;
  }

  return {
    ...inputs,
    deleteTags: inputs.deleteGhostImages
      ? _listLatestGhostTags(database, inputs.owner, inputs.packageName, inputs.cutoffTimestamp)
      : inputs.deletePartialImages
        ? _listLatestPartialTags(database, inputs.owner, inputs.packageName, inputs.cutoffTimestamp)
        : inputs.deleteOrphanedImages
          ? _listLatestOrphanedTags(database, inputs.owner, inputs.packageName, inputs.cutoffTimestamp)
          : inputs.deleteTags
  };
}

function _listLatestGhostTags(
  database: Database.Database,
  owner: string,
  packageName: string,
  cutoffTimestamp?: string
): string[] {
  return _listLatestBrokenIndexTags(database, owner, packageName, cutoffTimestamp, BrokenIndexModes.allMissing);
}

function _listLatestPartialTags(
  database: Database.Database,
  owner: string,
  packageName: string,
  cutoffTimestamp?: string
): string[] {
  return _listLatestBrokenIndexTags(database, owner, packageName, cutoffTimestamp, BrokenIndexModes.someMissing);
}

function _listLatestBrokenIndexTags(
  database: Database.Database,
  owner: string,
  packageName: string,
  cutoffTimestamp: string | undefined,
  mode: BrokenIndexMode
): string[] {
  const havingClause =
    mode === BrokenIndexModes.allMissing
      ? "COUNT(*) > 0 AND COUNT(child.digest) = 0"
      : "COUNT(child.digest) > 0 AND COUNT(child.digest) < COUNT(*)";
  const rows = database
    .prepare(
      `
        WITH latest_scan AS (
          SELECT scan_id
          FROM v_latest_scan_per_package
          WHERE owner = ?
            AND package_name = ?
        ),
        ghost_roots AS (
          SELECT
            m.scan_id,
            m.version_id
          FROM latest_scan ls
          JOIN manifests m
            ON m.scan_id = ls.scan_id
          JOIN package_versions pv
            ON pv.scan_id = m.scan_id
           AND pv.version_id = m.version_id
          JOIN tags root_tags
            ON root_tags.scan_id = m.scan_id
           AND root_tags.version_id = m.version_id
          JOIN manifest_descriptors md
            ON md.scan_id = m.scan_id
           AND md.parent_digest = m.digest
          LEFT JOIN manifests child
            ON child.scan_id = md.scan_id
           AND child.digest = md.child_digest
          WHERE m.media_type IN (
            'application/vnd.oci.image.index.v1+json',
            'application/vnd.docker.distribution.manifest.list.v2+json'
          )
            AND NOT EXISTS (
              SELECT 1
              FROM manifest_reachability mr
              WHERE mr.scan_id = m.scan_id
                AND mr.descendant_digest = m.digest
                AND mr.min_distance > 0
            )
            AND (? IS NULL OR pv.created_at < ?)
          GROUP BY m.scan_id, m.version_id
          HAVING ${havingClause}
        )
        SELECT DISTINCT t.tag
        FROM ghost_roots gr
        JOIN tags t
          ON t.scan_id = gr.scan_id
         AND t.version_id = gr.version_id
        ORDER BY t.tag
      `
    )
    .all(owner, packageName, cutoffTimestamp ?? null, cutoffTimestamp ?? null) as Array<{ tag: string }>;
  return rows.map((row) => row.tag);
}

// Some OCI tooling publishes companion artifacts such as signatures or attestations under
// digest tags in the same repository, for example `sha256-<digest>.sig`, while the
// actual relationship is the artifact's subject/referrer link to the parent digest.
//
// Public references:
// - Sigstore Cosign example pushing `sha256-<digest>.sig`:
//   https://docs.sigstore.dev/cosign/signing/other_types/
// - OCI referrers / subject model:
//   https://github.com/opencontainers/distribution-spec/blob/main/spec.md
//
// This resolver intentionally mirrors the `delete-orphaned-images` behavior from
// `dataaxiom/ghcr-cleanup-action`, but keeps the check narrow and local to the current package
// scan: derive the parent digest from the tag, then treat the tag as orphaned only when that
// digest is absent from the scanned manifests for the same package.
function _listLatestOrphanedTags(
  database: Database.Database,
  owner: string,
  packageName: string,
  cutoffTimestamp?: string
): string[] {
  const rows = database
    .prepare(
      `
        WITH latest_scan AS (
          SELECT scan_id
          FROM v_latest_scan_per_package
          WHERE owner = ?
            AND package_name = ?
        ),
        digest_tag_artifacts AS (
          SELECT
            t.tag,
            t.scan_id,
            t.version_id AS artifact_version_id,
            'sha256:' || SUBSTR(t.tag, 8, 64) AS parent_digest
          FROM latest_scan ls
          JOIN tags t
            ON t.scan_id = ls.scan_id
          WHERE t.is_digest_tag = 1
        )
        SELECT DISTINCT dta.tag
        FROM digest_tag_artifacts dta
        JOIN package_versions pv
          ON pv.scan_id = dta.scan_id
         AND pv.version_id = dta.artifact_version_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM manifests parent
            WHERE parent.scan_id = dta.scan_id
              AND parent.digest = dta.parent_digest
          )
          AND (? IS NULL OR pv.created_at < ?)
        ORDER BY dta.tag
      `
    )
    .all(owner, packageName, cutoffTimestamp ?? null, cutoffTimestamp ?? null) as Array<{ tag: string }>;
  return rows.map((row) => row.tag);
}
