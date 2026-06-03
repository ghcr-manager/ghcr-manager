PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS package_scans (
  scan_id INTEGER PRIMARY KEY,
  scan_uuid TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  package_name TEXT NOT NULL,
  package_metadata_json TEXT NOT NULL,
  github_actions_run_url TEXT,
  scan_started_at TEXT NOT NULL,
  scan_completed_at TEXT,
  status TEXT NOT NULL,
  CHECK(status IN ('running', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS package_versions (
  scan_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(scan_id, version_id),
  FOREIGN KEY(scan_id) REFERENCES package_scans(scan_id)
);

CREATE TABLE IF NOT EXISTS package_version_payloads (
  scan_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  PRIMARY KEY(scan_id, version_id),
  FOREIGN KEY(scan_id, version_id) REFERENCES package_versions(scan_id, version_id)
);

CREATE TABLE IF NOT EXISTS tags (
  scan_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  version_id INTEGER NOT NULL,
  is_digest_tag INTEGER NOT NULL,
  CHECK(is_digest_tag IN (0, 1)),
  PRIMARY KEY(scan_id, tag),
  FOREIGN KEY(scan_id, version_id) REFERENCES package_versions(scan_id, version_id)
);

CREATE TABLE IF NOT EXISTS manifests (
  scan_id INTEGER NOT NULL,
  version_id INTEGER NOT NULL,
  digest TEXT NOT NULL,
  media_type TEXT NOT NULL,
  artifact_type TEXT,
  config_media_type TEXT,
  subject_digest TEXT,
  annotations_json TEXT,
  manifest_kind TEXT,
  CHECK(manifest_kind IN (
    'index_manifest',
    'multi_arch_manifest',
    'image_manifest',
    'artifact_manifest',
    'attestation_manifest',
    'signature_manifest'
  )),
  PRIMARY KEY(scan_id, version_id),
  UNIQUE(scan_id, digest),
  FOREIGN KEY(scan_id, version_id) REFERENCES package_versions(scan_id, version_id)
);

CREATE TABLE IF NOT EXISTS manifest_descriptors (
  scan_id INTEGER NOT NULL,
  parent_digest TEXT NOT NULL,
  child_digest TEXT NOT NULL,
  media_type TEXT NOT NULL,
  artifact_type TEXT,
  platform_os TEXT,
  platform_architecture TEXT,
  platform_variant TEXT,
  PRIMARY KEY(scan_id, parent_digest, child_digest),
  FOREIGN KEY(scan_id, parent_digest) REFERENCES manifests(scan_id, digest)
);

CREATE TABLE IF NOT EXISTS manifest_payloads (
  scan_id INTEGER NOT NULL,
  digest TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  PRIMARY KEY(scan_id, digest),
  FOREIGN KEY(scan_id, digest) REFERENCES manifests(scan_id, digest)
);

CREATE TABLE IF NOT EXISTS manifest_edges (
  scan_id INTEGER NOT NULL,
  parent_digest TEXT NOT NULL,
  child_digest TEXT NOT NULL,
  edge_kind TEXT NOT NULL,
  CHECK(edge_kind IN ('image-child', 'referrer', 'digest-tag-referrer')),
  PRIMARY KEY(scan_id, parent_digest, child_digest, edge_kind),
  FOREIGN KEY(scan_id, parent_digest) REFERENCES manifests(scan_id, digest),
  FOREIGN KEY(scan_id, child_digest) REFERENCES manifests(scan_id, digest)
);

CREATE TABLE IF NOT EXISTS manifest_reachability (
  scan_id INTEGER NOT NULL,
  ancestor_digest TEXT NOT NULL,
  descendant_digest TEXT NOT NULL,
  min_distance INTEGER NOT NULL,
  PRIMARY KEY(scan_id, ancestor_digest, descendant_digest),
  FOREIGN KEY(scan_id, ancestor_digest) REFERENCES manifests(scan_id, digest),
  FOREIGN KEY(scan_id, descendant_digest) REFERENCES manifests(scan_id, digest),
  CHECK(min_distance >= 0)
);

CREATE TABLE IF NOT EXISTS manifest_graphs (
  scan_id INTEGER NOT NULL,
  digest TEXT NOT NULL,
  graph_id INTEGER NOT NULL,
  PRIMARY KEY(scan_id, digest),
  FOREIGN KEY(scan_id, digest) REFERENCES manifests(scan_id, digest),
  CHECK(graph_id > 0)
);

CREATE TABLE IF NOT EXISTS cleanup_runs (
  cleanup_run_id INTEGER PRIMARY KEY,
  scan_id INTEGER NOT NULL,
  cleanup_uuid TEXT NOT NULL,
  cleanup_started_at TEXT NOT NULL,
  github_actions_run_url TEXT,
  dry_run INTEGER NOT NULL,
  planner_inputs_json TEXT NOT NULL,
  direct_target_tag_count INTEGER NOT NULL,
  direct_target_root_count INTEGER NOT NULL,
  delete_root_candidate_count INTEGER NOT NULL,
  untag_only_root_count INTEGER NOT NULL,
  fully_deletable_root_count INTEGER NOT NULL,
  blocked_delete_root_count INTEGER NOT NULL,
  protected_root_count INTEGER NOT NULL,
  CHECK(dry_run IN (0, 1)),
  UNIQUE(cleanup_run_id, scan_id),
  FOREIGN KEY(scan_id) REFERENCES package_scans(scan_id)
);

CREATE TABLE IF NOT EXISTS cleanup_root_decisions (
  cleanup_run_id INTEGER NOT NULL,
  scan_id INTEGER NOT NULL,
  digest TEXT NOT NULL,
  selection_mode TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  validation_status TEXT NOT NULL,
  validation_reason_code TEXT NOT NULL,
  validation_reason TEXT NOT NULL,
  blocking_digest TEXT,
  overlap_digest TEXT,
  PRIMARY KEY(cleanup_run_id, digest),
  CHECK(selection_mode IN ('delete-root', 'untag-only')),
  CHECK(selection_reason IN (
    'delete-tags-all-tags-selected',
    'delete-tags-partial-tag-match',
    'delete-untagged',
    'keep-n-tagged-overflow',
    'keep-n-untagged-overflow'
  )),
  CHECK(validation_status IN ('fully-deletable', 'blocked', 'untag-only')),
  CHECK(validation_reason_code IN (
    'untag-only-partial-tag-match',
    'untag-only-retained-manifest',
    'fully-deletable-no-retained-overlap',
    'blocked-overlap-with-retained-root'
  )),
  FOREIGN KEY(cleanup_run_id, scan_id) REFERENCES cleanup_runs(cleanup_run_id, scan_id),
  FOREIGN KEY(scan_id, digest) REFERENCES manifests(scan_id, digest),
  FOREIGN KEY(scan_id, blocking_digest) REFERENCES manifests(scan_id, digest),
  FOREIGN KEY(scan_id, overlap_digest) REFERENCES manifests(scan_id, digest)
);

CREATE TABLE IF NOT EXISTS cleanup_selected_tags (
  cleanup_run_id INTEGER NOT NULL,
  scan_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  is_deleted INTEGER NOT NULL,
  PRIMARY KEY(cleanup_run_id, tag),
  CHECK(is_deleted IN (0, 1)),
  FOREIGN KEY(cleanup_run_id, scan_id) REFERENCES cleanup_runs(cleanup_run_id, scan_id),
  FOREIGN KEY(scan_id, tag) REFERENCES tags(scan_id, tag)
);

CREATE TABLE IF NOT EXISTS cleanup_protected_root_blocks (
  cleanup_run_id INTEGER NOT NULL,
  scan_id INTEGER NOT NULL,
  protected_digest TEXT NOT NULL,
  blocked_digest TEXT NOT NULL,
  block_reason_code TEXT NOT NULL,
  overlap_digest TEXT NOT NULL,
  PRIMARY KEY(cleanup_run_id, protected_digest, blocked_digest, overlap_digest),
  CHECK(block_reason_code IN ('overlap-with-retained-root')),
  FOREIGN KEY(cleanup_run_id, scan_id) REFERENCES cleanup_runs(cleanup_run_id, scan_id),
  FOREIGN KEY(scan_id, protected_digest, overlap_digest)
    REFERENCES manifest_reachability(scan_id, ancestor_digest, descendant_digest),
  FOREIGN KEY(scan_id, blocked_digest, overlap_digest)
    REFERENCES manifest_reachability(scan_id, ancestor_digest, descendant_digest)
);

CREATE INDEX IF NOT EXISTS idx_package_versions_scan_created_at ON package_versions(scan_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_package_scans_scan_uuid ON package_scans(scan_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cleanup_runs_cleanup_uuid ON cleanup_runs(cleanup_uuid);
CREATE INDEX IF NOT EXISTS idx_package_scans_owner_name_started_at
  ON package_scans(owner, package_name, scan_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cleanup_runs_scan_id ON cleanup_runs(scan_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_protected_root_blocks_run_blocked
  ON cleanup_protected_root_blocks(cleanup_run_id, blocked_digest);
CREATE INDEX IF NOT EXISTS idx_tags_scan_version ON tags(scan_id, version_id);
CREATE INDEX IF NOT EXISTS idx_manifest_descriptors_scan_child ON manifest_descriptors(scan_id, child_digest);
CREATE INDEX IF NOT EXISTS idx_manifest_edges_scan_parent ON manifest_edges(scan_id, parent_digest);
CREATE INDEX IF NOT EXISTS idx_manifest_edges_scan_child ON manifest_edges(scan_id, child_digest);
CREATE INDEX IF NOT EXISTS idx_manifest_edges_scan_child_kind ON manifest_edges(scan_id, child_digest, edge_kind);
CREATE INDEX IF NOT EXISTS idx_manifest_reachability_scan_descendant
  ON manifest_reachability(scan_id, descendant_digest);
CREATE INDEX IF NOT EXISTS idx_manifest_reachability_scan_descendant_distance
  ON manifest_reachability(scan_id, descendant_digest, min_distance);
CREATE INDEX IF NOT EXISTS idx_manifest_graphs_scan_graph_id
  ON manifest_graphs(scan_id, graph_id);
