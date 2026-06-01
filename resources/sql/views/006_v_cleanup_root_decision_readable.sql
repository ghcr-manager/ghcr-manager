DROP VIEW IF EXISTS v_cleanup_root_decision_readable;

CREATE VIEW v_cleanup_root_decision_readable AS
WITH selected_tag_summary AS (
  SELECT
    selected.cleanup_run_id,
    tag.version_id AS root_version_id,
    COUNT(*) AS selected_tag_count,
    GROUP_CONCAT(selected.tag, ', ') AS selected_tags
  FROM cleanup_selected_tags selected
  JOIN tags tag
    ON tag.scan_id = selected.scan_id
   AND tag.tag = selected.tag
  GROUP BY
    selected.cleanup_run_id,
    tag.version_id
)
SELECT
  run.cleanup_run_id,
  run.scan_id,
  scan.owner,
  scan.package_name,
  decision.digest AS root_digest,
  root_manifest.version_id AS root_version_id,
  root_manifest.manifest_kind AS root_manifest_kind,
  decision.selection_mode,
  CASE decision.selection_mode
    WHEN 'delete-root' THEN 'delete root'
    WHEN 'untag-only' THEN 'detach selected tags only'
  END AS selection_mode_label,
  decision.selection_reason,
  CASE decision.selection_reason
    WHEN 'delete-tags-all-tags-selected' THEN 'all tags on this root were selected'
    WHEN 'delete-tags-partial-tag-match' THEN 'only part of this root''s tag set was selected'
    WHEN 'delete-untagged' THEN 'root was selected because it is untagged'
    WHEN 'keep-n-tagged-overflow' THEN 'root fell outside the tagged keep window'
    WHEN 'keep-n-untagged-overflow' THEN 'root fell outside the untagged keep window'
  END AS selection_reason_label,
  decision.validation_status,
  CASE decision.validation_status
    WHEN 'fully-deletable' THEN 'root and closure can be deleted'
    WHEN 'untag-only' THEN 'only selected tags can be detached'
    WHEN 'blocked' THEN 'root deletion is blocked'
  END AS validation_status_label,
  decision.validation_reason_code,
  CASE decision.validation_reason_code
    WHEN 'fully-deletable-no-retained-overlap' THEN 'no retained root overlaps this closure'
    WHEN 'untag-only-partial-tag-match' THEN 'matched tags cover only part of the root tag set'
    WHEN 'untag-only-retained-manifest' THEN 'selected tags can be detached but the manifest is still needed'
    WHEN 'blocked-overlap-with-retained-root' THEN 'a retained root still requires an overlapping manifest'
  END AS validation_reason_code_label,
  decision.validation_reason,
  decision.blocking_digest,
  decision.overlap_digest,
  COALESCE(tag_summary.selected_tag_count, 0) AS selected_tag_count,
  tag_summary.selected_tags
FROM cleanup_root_decisions decision
JOIN cleanup_runs run
  ON run.cleanup_run_id = decision.cleanup_run_id
 AND run.scan_id = decision.scan_id
JOIN package_scans scan
  ON scan.scan_id = run.scan_id
JOIN manifests root_manifest
  ON root_manifest.scan_id = decision.scan_id
 AND root_manifest.digest = decision.digest
LEFT JOIN selected_tag_summary tag_summary
  ON tag_summary.cleanup_run_id = decision.cleanup_run_id
 AND tag_summary.root_version_id = root_manifest.version_id;
